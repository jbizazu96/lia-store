import * as admin from "firebase-admin";
import {randomUUID} from "crypto";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import sharp from "sharp";
import {requireAdminPermission} from "../admin/adminAuthorizationService";
import {writeAdminAuditLog} from "../admin/adminAuditLogService";
import {synchronizeProductPublicProfile} from "../triggers/productPublicProfileSync";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");
const MAX_ICON_BYTES = 3 * 1024 * 1024;
const CATALOG_POLICY_REFERENCE = db.collection("settings").doc("productCatalog");
const DEFAULT_LOW_STOCK_THRESHOLD = 10;
const DEFAULT_INVENTORY_EMAILS_PER_DAY = 1;
const DEFAULT_SIZE_UNITS = [
  {id: "each", label: "Each"}, {id: "oz", label: "Ounce (oz)"},
  {id: "lb", label: "Pound (lb)"}, {id: "g", label: "Gram (g)"},
  {id: "kg", label: "Kilogram (kg)"}, {id: "ml", label: "Milliliter (ml)"},
  {id: "l", label: "Liter (L)"}, {id: "pack", label: "Pack"},
  {id: "box", label: "Box"},
];

function text(value: unknown, maximum = 100): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maximum) : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function categoryId(value: unknown): string {
  const id = text(value, 100);
  if (!id || id.includes("/")) throw new HttpsError("invalid-argument", "A valid product category is required.");
  return id;
}

function taxClassificationIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => taxClassificationId(entry)))].slice(0, 25);
}

async function validatedCategoryTaxMapping(input: Record<string, unknown>): Promise<{
  defaultTaxCategoryId: string | null;
  allowedTaxCategoryIds: string[];
}> {
  const allowedTaxCategoryIds = taxClassificationIds(input.allowedTaxCategoryIds);
  const defaultTaxCategoryId = text(input.defaultTaxCategoryId, 80)
    ? taxClassificationId(input.defaultTaxCategoryId)
    : null;
  if (defaultTaxCategoryId && !allowedTaxCategoryIds.includes(defaultTaxCategoryId)) {
    throw new HttpsError(
      "invalid-argument",
      "The default tax classification must also be selected as an allowed classification."
    );
  }
  if (allowedTaxCategoryIds.length > 0) {
    const snapshots = await db.getAll(...allowedTaxCategoryIds.map((id) =>
      db.collection("productTaxClassifications").doc(id)
    ));
    if (snapshots.some((snapshot) => !snapshot.exists)) {
      throw new HttpsError(
        "failed-precondition",
        "One or more selected tax classifications no longer exist."
      );
    }
    if (snapshots.some((snapshot) => snapshot.data()?.isActive === false)) {
      throw new HttpsError(
        "failed-precondition",
        "Inactive tax classifications cannot be assigned to a product category."
      );
    }
  }
  return {defaultTaxCategoryId, allowedTaxCategoryIds};
}

function sizeUnitId(value: unknown): string {
  const id = text(value, 20).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,19}$/.test(id)) {
    throw new HttpsError("invalid-argument", "Use a unit code containing only lowercase letters, numbers, or hyphens.");
  }
  return id;
}

function taxClassificationId(value: unknown): string {
  const id = text(value, 80).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id)) {
    throw new HttpsError(
      "invalid-argument",
      "Use a stable classification ID containing lowercase letters, numbers, or hyphens."
    );
  }
  return id;
}

function stripeTaxCode(value: unknown): string {
  const code = text(value, 32).toLowerCase();
  if (!/^txcd_[0-9]{8}$/.test(code)) {
    throw new HttpsError(
      "invalid-argument",
      "Enter a valid Stripe product tax code, such as txcd_99999999."
    );
  }
  return code;
}

async function sizeUnits() {
  const snapshot = await db.collection("productSizeUnits").limit(100).get();
  return snapshot.docs.map((document) => ({
    id: document.id,
    label: text(document.data().label, 80) || document.id,
  })).sort((first, second) => first.label.localeCompare(second.label));
}

function wholeNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

export const getAdminProductCatalogPolicy = onCall({region: "us-central1"}, async (request) => {
  await requireAdminPermission(request, "product_categories");
  const policy = (await CATALOG_POLICY_REFERENCE.get()).data() ?? {};
  return {
    lowStockThreshold: wholeNumber(policy.lowStockThreshold, DEFAULT_LOW_STOCK_THRESHOLD, 0, 100_000),
    inventoryEmailsPerDay: wholeNumber(policy.inventoryEmailsPerDay, DEFAULT_INVENTORY_EMAILS_PER_DAY, 0, 4),
  };
});

export const saveAdminProductCatalogPolicy = onCall({region: "us-central1", timeoutSeconds: 540}, async (request) => {
  const administrator = await requireAdminPermission(request, "product_categories", "write");
  const input = record(request.data);
  const lowStockThreshold = wholeNumber(input.lowStockThreshold, -1, 0, 100_000);
  const inventoryEmailsPerDay = wholeNumber(input.inventoryEmailsPerDay, -1, 0, 4);
  if (lowStockThreshold < 0) throw new HttpsError("invalid-argument", "Enter a low-stock threshold from 0 to 100,000.");
  if (inventoryEmailsPerDay < 0) throw new HttpsError("invalid-argument", "Choose between 0 and 4 inventory emails per day.");

  const existing = (await CATALOG_POLICY_REFERENCE.get()).data() ?? {};
  let productsUpdated = 0;
  if (wholeNumber(existing.lowStockThreshold, DEFAULT_LOW_STOCK_THRESHOLD, 0, 100_000) !== lowStockThreshold) {
    const products = await db.collection("products").select("stock").get();
    const writer = db.bulkWriter();
    products.docs.forEach((product) => {
      const stock = Math.max(0, Math.floor(Number(product.data().stock) || 0));
      writer.update(product.ref, {
        lowStockThreshold,
        isLowStock: stock > 0 && stock <= lowStockThreshold,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await writer.close();
    productsUpdated = products.size;
  }

  await CATALOG_POLICY_REFERENCE.set({
    lowStockThreshold,
    inventoryEmailsPerDay,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: administrator.uid,
  }, {merge: true});
  await writeAdminAuditLog(administrator, {
    action: "product_catalog_policy.updated",
    targetType: "setting",
    targetId: "productCatalog",
    details: {lowStockThreshold, inventoryEmailsPerDay, productsUpdated},
  });
  return {success: true, productsUpdated};
});

export const getStoreProductSizeUnits = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to load product size units.");
  return {units: await sizeUnits()};
});

export const getStoreProductTaxConfiguration = onCall(
  {region: "us-central1"},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to load product tax options.");
    }
    const [categories, classifications] = await Promise.all([
      db.collection("categories").limit(250).get(),
      db.collection("productTaxClassifications").limit(250).get(),
    ]);
    const activeClassifications = classifications.docs
      .filter((document) => document.data().isActive !== false)
      .map((document) => ({
        id: document.id,
        name: text(document.data().name, 100) || document.id,
        description: text(document.data().description, 500),
        requiresStoreConfirmation: document.data().requiresStoreConfirmation === true,
      }))
      .sort((first, second) => first.name.localeCompare(second.name));
    const activeIds = new Set(activeClassifications.map((item) => item.id));
    return {
      classifications: activeClassifications,
      categories: categories.docs.map((document) => {
        const data = document.data();
        const allowedTaxCategoryIds = taxClassificationIds(data.allowedTaxCategoryIds)
          .filter((id) => activeIds.has(id));
        const configuredDefault = text(data.defaultTaxCategoryId, 80);
        return {
          categoryId: document.id,
          defaultTaxCategoryId:
            configuredDefault && allowedTaxCategoryIds.includes(configuredDefault)
              ? configuredDefault
              : null,
          allowedTaxCategoryIds,
        };
      }),
    };
  },
);

export const getAdminProductSizeUnits = onCall({region: "us-central1"}, async (request) => {
  await requireAdminPermission(request, "product_categories");
  return {units: await sizeUnits()};
});

export const createAdminProductSizeUnit = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "product_categories", "write");
  const input = request.data && typeof request.data === "object" ? request.data as Record<string, unknown> : {};
  const id = sizeUnitId(input.id);
  const label = text(input.label, 80);
  if (label.length < 1) throw new HttpsError("invalid-argument", "Enter a size-unit label.");
  try {
    await db.collection("productSizeUnits").doc(id).create({label, createdAt: FieldValue.serverTimestamp(), createdBy: administrator.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: administrator.uid});
  } catch (error) {
    if ((error as {code?: unknown}).code === 6 || (error as {code?: unknown}).code === "already-exists") throw new HttpsError("already-exists", "That size-unit code already exists.");
    throw error;
  }
  await writeAdminAuditLog(administrator, {action: "product_size_unit.created", targetType: "productSizeUnit", targetId: id, details: {label}});
  return {id};
});

export const updateAdminProductSizeUnit = onCall({region: "us-central1", timeoutSeconds: 540}, async (request) => {
  const administrator = await requireAdminPermission(request, "product_categories", "write");
  const input = request.data && typeof request.data === "object" ? request.data as Record<string, unknown> : {};
  const id = sizeUnitId(input.id);
  const nextId = sizeUnitId(input.nextId ?? input.id);
  const label = text(input.label, 80);
  if (!label) throw new HttpsError("invalid-argument", "Enter a size-unit label.");
  const reference = db.collection("productSizeUnits").doc(id);
  const existing = await reference.get();
  if (!existing.exists) throw new HttpsError("not-found", "Size unit not found.");
  if (nextId !== id && (await db.collection("productSizeUnits").doc(nextId).get()).exists) {
    throw new HttpsError("already-exists", "That size-unit code already exists.");
  }

  let productsUpdated = 0;
  let publicProfilesUpdated = 0;
  let cartsUpdated = 0;
  if (nextId !== id) {
    const [products, profiles] = await Promise.all([
      db.collection("products").where("size.unit", "==", id).get(),
      db.collection("productPublicProfiles").where("size.unit", "==", id).get(),
    ]);
    const writer = db.bulkWriter();
    products.docs.forEach((document) => writer.update(document.ref, {"size.unit": nextId, updatedAt: FieldValue.serverTimestamp()}));
    profiles.docs.forEach((document) => writer.update(document.ref, {"size.unit": nextId, updatedAt: FieldValue.serverTimestamp()}));
    productsUpdated = products.size;
    publicProfilesUpdated = profiles.size;

    let lastCartId: string | undefined;
    while (true) {
      let query = db.collection("carts").orderBy("__name__").limit(250);
      if (lastCartId) query = query.startAfter(lastCartId);
      const carts = await query.get();
      if (carts.empty) break;
      carts.docs.forEach((document) => {
        const data = document.data();
        if (!Array.isArray(data.items)) return;
        let changed = false;
        const items = data.items.map((item: unknown) => {
          const entry = record(item);
          const size = record(entry.size);
          if (text(size.unit, 20).toLowerCase() !== id) return item;
          changed = true;
          return {...entry, size: {...size, unit: nextId}};
        });
        if (changed) {writer.update(document.ref, {items, updatedAt: FieldValue.serverTimestamp()}); cartsUpdated += 1;}
      });
      lastCartId = carts.docs[carts.docs.length - 1]?.id;
      if (carts.size < 250) break;
    }
    await writer.close();
  }

  if (nextId === id) {
    await reference.update({label, updatedAt: FieldValue.serverTimestamp(), updatedBy: administrator.uid});
  } else {
    await db.runTransaction(async (transaction) => {
      const nextReference = db.collection("productSizeUnits").doc(nextId);
      const next = await transaction.get(nextReference);
      if (next.exists) throw new HttpsError("already-exists", "That size-unit code already exists.");
      transaction.create(nextReference, {...existing.data(), label, updatedAt: FieldValue.serverTimestamp(), updatedBy: administrator.uid});
      transaction.delete(reference);
    });
  }
  await writeAdminAuditLog(administrator, {action: "product_size_unit.updated", targetType: "productSizeUnit", targetId: nextId, details: {previousCode: id, code: nextId, previousLabel: text(existing.data()?.label, 80), label, productsUpdated, publicProfilesUpdated, cartsUpdated}});
  return {success: true};
});

export const deleteAdminProductSizeUnit = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "product_categories", "write");
  const id = sizeUnitId(record(request.data).id);
  const reference = db.collection("productSizeUnits").doc(id);
  const existing = await reference.get();
  if (!existing.exists) throw new HttpsError("not-found", "Size unit not found.");
  await reference.delete();
  await writeAdminAuditLog(administrator, {action: "product_size_unit.deleted", targetType: "productSizeUnit", targetId: id, details: {label: text(existing.data()?.label, 80)}});
  return {success: true};
});

export const importAdminProductSizeUnits = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "product_categories", "write");
  const [products, configured] = await Promise.all([
    db.collection("products").select("size").get(),
    db.collection("productSizeUnits").get(),
  ]);
  const labels = new Map(DEFAULT_SIZE_UNITS.map((unit) => [unit.id, unit.label]));
  products.docs.forEach((document) => {
    const unit = text(record(document.data().size).unit, 20).toLowerCase();
    if (/^[a-z0-9][a-z0-9-]{0,19}$/.test(unit) && !labels.has(unit)) labels.set(unit, inferredName(unit));
  });
  const existing = new Set(configured.docs.map((document) => document.id));
  const missing = [...labels].filter(([id]) => !existing.has(id));
  const batch = db.batch();
  missing.forEach(([id, label]) => batch.create(db.collection("productSizeUnits").doc(id), {label, source: "existing_units_import", createdAt: FieldValue.serverTimestamp(), createdBy: administrator.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: administrator.uid}));
  if (missing.length > 0) await batch.commit();
  await writeAdminAuditLog(administrator, {action: "product_size_units.imported", targetType: "productSizeUnit", targetId: "existing-units", details: {created: missing.length, productsScanned: products.size}});
  return {success: true, created: missing.length, productsScanned: products.size};
});

async function requireUniqueTaxClassificationName(
  name: string,
  excludedId?: string,
): Promise<void> {
  const normalizedName = name.toLowerCase();
  const snapshot = await db.collection("productTaxClassifications").limit(250).get();
  if (snapshot.docs.some((document) =>
    document.id !== excludedId &&
    text(document.data().name, 100).toLowerCase() === normalizedName
  )) {
    throw new HttpsError(
      "already-exists",
      "A tax classification with this name already exists."
    );
  }
}

export const getAdminProductTaxClassifications = onCall(
  {region: "us-central1"},
  async (request) => {
    await requireAdminPermission(request, "product_categories");
    const snapshot = await db.collection("productTaxClassifications").limit(250).get();
    return {
      classifications: snapshot.docs.map((document) => {
        const data = document.data();
        return {
          id: document.id,
          name: text(data.name, 100) || document.id,
          description: text(data.description, 500),
          stripeTaxCode: text(data.stripeTaxCode, 32).toLowerCase(),
          isActive: data.isActive !== false,
          requiresStoreConfirmation: data.requiresStoreConfirmation === true,
        };
      }).sort((first, second) => first.name.localeCompare(second.name)),
    };
  },
);

export const createAdminProductTaxClassification = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireAdminPermission(
      request,
      "product_categories",
      "write",
    );
    const input = record(request.data);
    const name = text(input.name, 100);
    const id = taxClassificationId(input.id ?? slug(name));
    const description = text(input.description, 500);
    const taxCode = stripeTaxCode(input.stripeTaxCode);
    if (name.length < 2) {
      throw new HttpsError(
        "invalid-argument",
        "Enter a tax-classification name with at least two characters."
      );
    }
    if (description.length < 10) {
      throw new HttpsError(
        "invalid-argument",
        "Add a short description so stores can classify products consistently."
      );
    }
    await requireUniqueTaxClassificationName(name);
    const reference = db.collection("productTaxClassifications").doc(id);
    try {
      await reference.create({
        name,
        normalizedName: name.toLowerCase(),
        description,
        stripeTaxCode: taxCode,
        isActive: input.isActive !== false,
        requiresStoreConfirmation: input.requiresStoreConfirmation === true,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: administrator.uid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: administrator.uid,
      });
    } catch (error) {
      if ((error as {code?: unknown}).code === 6 ||
          (error as {code?: unknown}).code === "already-exists") {
        throw new HttpsError(
          "already-exists",
          "That stable tax-classification ID already exists."
        );
      }
      throw error;
    }
    await writeAdminAuditLog(administrator, {
      action: "product_tax_classification.created",
      targetType: "productTaxClassification",
      targetId: id,
      details: {name, stripeTaxCode: taxCode},
    });
    return {id};
  },
);

export const updateAdminProductTaxClassification = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireAdminPermission(
      request,
      "product_categories",
      "write",
    );
    const input = record(request.data);
    const id = taxClassificationId(input.id);
    const name = text(input.name, 100);
    const description = text(input.description, 500);
    const taxCode = stripeTaxCode(input.stripeTaxCode);
    if (name.length < 2 || description.length < 10) {
      throw new HttpsError(
        "invalid-argument",
        "Enter a name and a description of at least 10 characters."
      );
    }
    const reference = db.collection("productTaxClassifications").doc(id);
    const existing = await reference.get();
    if (!existing.exists) {
      throw new HttpsError("not-found", "Tax classification not found.");
    }
    await requireUniqueTaxClassificationName(name, id);
    await reference.update({
      name,
      normalizedName: name.toLowerCase(),
      description,
      stripeTaxCode: taxCode,
      isActive: input.isActive !== false,
      requiresStoreConfirmation: input.requiresStoreConfirmation === true,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: administrator.uid,
    });
    await writeAdminAuditLog(administrator, {
      action: "product_tax_classification.updated",
      targetType: "productTaxClassification",
      targetId: id,
      details: {
        previousName: text(existing.data()?.name, 100),
        name,
        previousStripeTaxCode: text(existing.data()?.stripeTaxCode, 32),
        stripeTaxCode: taxCode,
        isActive: input.isActive !== false,
        requiresStoreConfirmation: input.requiresStoreConfirmation === true,
      },
    });
    return {success: true};
  },
);

export const deleteAdminProductTaxClassification = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireAdminPermission(
      request,
      "product_categories",
      "write",
    );
    const id = taxClassificationId(record(request.data).id);
    const reference = db.collection("productTaxClassifications").doc(id);
    const existing = await reference.get();
    if (!existing.exists) {
      throw new HttpsError("not-found", "Tax classification not found.");
    }
    const [assignedProduct, categoryDefault, categoryAllowed] = await Promise.all([
      db.collection("products").where("taxCategoryId", "==", id).limit(1).get(),
      db.collection("categories").where("defaultTaxCategoryId", "==", id).limit(1).get(),
      db.collection("categories").where("allowedTaxCategoryIds", "array-contains", id).limit(1).get(),
    ]);
    if (!assignedProduct.empty || !categoryDefault.empty || !categoryAllowed.empty) {
      throw new HttpsError(
        "failed-precondition",
        "This classification is assigned to a product or category. Deactivate it instead."
      );
    }
    await reference.delete();
    await writeAdminAuditLog(administrator, {
      action: "product_tax_classification.deleted",
      targetType: "productTaxClassification",
      targetId: id,
      details: {
        name: text(existing.data()?.name, 100),
        stripeTaxCode: text(existing.data()?.stripeTaxCode, 32),
      },
    });
    return {success: true};
  },
);

export const backfillAdminProductTaxClassifications = onCall(
  {region: "us-central1", timeoutSeconds: 540},
  async (request) => {
    const administrator = await requireAdminPermission(
      request,
      "product_categories",
      "write",
    );
    const cursor = text(record(request.data).cursor, 200);
    let query = db.collection("products").orderBy("__name__").limit(300);
    if (cursor) query = query.startAfter(cursor);
    const [products, categories, classifications] = await Promise.all([
      query.get(),
      db.collection("categories").get(),
      db.collection("productTaxClassifications").get(),
    ]);
    const categoryMap = new Map(categories.docs.map((document) => [document.id, document.data()]));
    const classificationMap = new Map(classifications.docs.map((document) => [document.id, document.data()]));
    const writer = db.bulkWriter();
    let classified = 0;
    let deactivated = 0;
    let reactivated = 0;
    let unchanged = 0;

    products.docs.forEach((product) => {
      const data = product.data();
      const category = categoryMap.get(text(data.category, 100));
      const allowedIds = category ? taxClassificationIds(category.allowedTaxCategoryIds) : [];
      const currentId = text(data.taxCategoryId, 80);
      const current = classificationMap.get(currentId);
      if (currentId && allowedIds.includes(currentId) && current?.isActive !== false) {
        /*
         * Version 1 repairs products disabled by the original tax migration,
         * which did not record why availability was turned off. The marker
         * makes this a one-time recovery and prevents later runs from enabling
         * products a store intentionally disables.
         */
        if (data.taxAvailabilityMigrationVersion !== 1) {
          writer.update(product.ref, {
            taxAvailabilityMigrationVersion: 1,
            ...(data.isAvailable === false ? {isAvailable: true} : {}),
            updatedAt: FieldValue.serverTimestamp(),
          });
          if (data.isAvailable === false) reactivated += 1;
          else unchanged += 1;
          return;
        }
        if (data.taxPublicationBlocked === true) {
          writer.update(product.ref, {
            isAvailable: data.availableBeforeTaxBlock !== false,
            taxPublicationBlocked: FieldValue.delete(),
            availableBeforeTaxBlock: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          reactivated += 1;
          return;
        }
        unchanged += 1;
        return;
      }

      const defaultId = category ? text(category.defaultTaxCategoryId, 80) : "";
      const defaultClassification = classificationMap.get(defaultId);
      const canApplyDefault =
        Boolean(defaultId) &&
        allowedIds.includes(defaultId) &&
        defaultClassification?.isActive !== false &&
        defaultClassification?.requiresStoreConfirmation !== true &&
        allowedIds.length === 1;
      if (canApplyDefault) {
        writer.update(product.ref, {
          taxCategoryId: defaultId,
          taxClassificationSource: "category_default",
          taxAvailabilityMigrationVersion: 1,
          ...(data.taxPublicationBlocked === true ||
          data.taxAvailabilityMigrationVersion !== 1 ? {
            isAvailable: data.taxPublicationBlocked === true
              ? data.availableBeforeTaxBlock !== false
              : true,
            taxPublicationBlocked: FieldValue.delete(),
            availableBeforeTaxBlock: FieldValue.delete(),
          } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });
        classified += 1;
        return;
      }

      writer.update(product.ref, {
        taxCategoryId: null,
        taxClassificationSource: null,
        isAvailable: false,
        featured: false,
        taxPublicationBlocked: true,
        availableBeforeTaxBlock: data.taxAvailabilityMigrationVersion !== 1
          ? true
          : data.isAvailable !== false,
        taxAvailabilityMigrationVersion: 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
      deactivated += 1;
    });
    await writer.close();

    /*
     * Rebuild every scanned projection, including products whose existing tax
     * classification was already valid. This also repairs catalogs that were
     * emptied before the tax-aware projection trigger was deployed.
     */
    for (let index = 0; index < products.docs.length; index += 25) {
      await Promise.all(products.docs
        .slice(index, index + 25)
        .map((product) => synchronizeProductPublicProfile(product.id)));
    }
    const nextCursor = products.size === 300
      ? products.docs[products.docs.length - 1]?.id ?? null
      : null;
    await writeAdminAuditLog(administrator, {
      action: "product_tax_classifications.backfilled",
      targetType: "productTaxClassification",
      targetId: cursor || "first-page",
      details: {
        scanned: products.size,
        classified,
        deactivated,
        reactivated,
        unchanged,
        hasMore: Boolean(nextCursor),
      },
    });
    return {
      success: true,
      scanned: products.size,
      classified,
      deactivated,
      reactivated,
      unchanged,
      nextCursor,
    };
  },
);

function slug(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

async function requireUniqueName(name: string, excludedId?: string): Promise<void> {
  const normalizedName = name.toLowerCase();
  const snapshot = await db.collection("categories").limit(250).get();
  if (snapshot.docs.some((document) => document.id !== excludedId && text(document.data().name).toLowerCase() === normalizedName)) {
    throw new HttpsError("already-exists", "A product category with this name already exists.");
  }
}

export const getAdminProductCategories = onCall({region: "us-central1"}, async (request) => {
  await requireAdminPermission(request, "product_categories");
  const snapshot = await db.collection("categories").limit(250).get();
  return {categories: snapshot.docs.map((document) => {
    const data = document.data();
    return {
      id: document.id,
      name: text(data.name) || "Unnamed category",
      iconUrl: text(data.iconUrl, 2_000),
      freshnessEligible: data.freshnessEligible === true,
      defaultTaxCategoryId: text(data.defaultTaxCategoryId, 80) || null,
      allowedTaxCategoryIds: taxClassificationIds(data.allowedTaxCategoryIds),
    };
  }).sort((first, second) => first.name.localeCompare(second.name))};
});

export const createAdminProductCategory = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "product_categories", "write");
  const input = request.data && typeof request.data === "object" ? request.data as Record<string, unknown> : {};
  const name = text(input.name);
  const freshnessEligible = input.freshnessEligible === true;
  const taxMapping = await validatedCategoryTaxMapping(input);
  const id = slug(name);
  if (name.length < 2 || !id) throw new HttpsError("invalid-argument", "Enter a category name with at least two characters.");
  await requireUniqueName(name);
  const reference = db.collection("categories").doc(id);
  try {
    await reference.create({name, freshnessEligible, ...taxMapping, normalizedName: name.toLowerCase(), createdAt: FieldValue.serverTimestamp(), createdBy: administrator.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: administrator.uid});
  } catch (error) {
    if ((error as {code?: unknown}).code === 6 || (error as {code?: unknown}).code === "already-exists") {
      throw new HttpsError("already-exists", "That category ID is already in use. Edit the existing category instead.");
    }
    throw error;
  }
  await writeAdminAuditLog(administrator, {action: "product_category.created", targetType: "productCategory", targetId: id, details: {name, defaultTaxCategoryId: taxMapping.defaultTaxCategoryId, allowedTaxCategoryIds: taxMapping.allowedTaxCategoryIds.join(","), allowedTaxClassificationCount: taxMapping.allowedTaxCategoryIds.length}});
  return {id};
});

export const updateAdminProductCategory = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "product_categories", "write");
  const input = request.data && typeof request.data === "object" ? request.data as Record<string, unknown> : {};
  const id = categoryId(input.id);
  const name = text(input.name);
  const freshnessEligible = input.freshnessEligible === true;
  const taxMapping = await validatedCategoryTaxMapping(input);
  if (name.length < 2) throw new HttpsError("invalid-argument", "Enter a category name with at least two characters.");
  const reference = db.collection("categories").doc(id);
  const existing = await reference.get();
  if (!existing.exists) throw new HttpsError("not-found", "Product category not found.");
  await requireUniqueName(name, id);
  await reference.update({name, freshnessEligible, ...taxMapping, normalizedName: name.toLowerCase(), icon: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(), updatedBy: administrator.uid});
  const summaries = await db.collectionGroup("productCategorySummaries").where("categoryId", "==", id).get();
  if (!summaries.empty) {
    const writer = db.bulkWriter();
    summaries.docs.forEach((summary) => writer.update(summary.ref, {name, updatedAt: FieldValue.serverTimestamp()}));
    await writer.close();
  }
  await writeAdminAuditLog(administrator, {action: "product_category.updated", targetType: "productCategory", targetId: id, details: {previousName: text(existing.data()?.name), name, defaultTaxCategoryId: taxMapping.defaultTaxCategoryId, allowedTaxCategoryIds: taxMapping.allowedTaxCategoryIds.join(","), allowedTaxClassificationCount: taxMapping.allowedTaxCategoryIds.length}});
  return {success: true};
});

function inferredName(id: string): string {
  return id.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export const importAdminProductCategories = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "product_categories", "write");
  const [products, categories] = await Promise.all([
    db.collection("products").select("category").get(),
    db.collection("categories").get(),
  ]);
  const existingIds = new Set(categories.docs.map((document) => document.id));
  const ids = [...new Set(products.docs.map((document) => text(document.data().category)).filter((id) => id && !id.includes("/")))]
    .filter((id) => !existingIds.has(id));
  for (let start = 0; start < ids.length; start += 450) {
    const batch = db.batch();
    ids.slice(start, start + 450).forEach((id) => {
      const name = inferredName(id) || id;
      batch.create(db.collection("categories").doc(id), {
        name,
        normalizedName: name.toLowerCase(),
        freshnessEligible: false,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: administrator.uid,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: administrator.uid,
        source: "existing_products_import",
      });
    });
    await batch.commit();
  }
  await writeAdminAuditLog(administrator, {action: "product_categories.imported", targetType: "productCategory", targetId: "existing-products", details: {created: ids.length, productsScanned: products.size}});
  return {success: true, created: ids.length, productsScanned: products.size};
});

function decodeIcon(value: unknown): Buffer {
  const encoded = text(value, 5_000_000);
  if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new HttpsError("invalid-argument", "Choose a valid category image.");
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0 || bytes.length > MAX_ICON_BYTES) {
    throw new HttpsError("invalid-argument", "Category images must be no larger than 3 MB.");
  }
  return bytes;
}

function downloadUrl(bucketName: string, path: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

export const uploadAdminProductCategoryIcon = onCall(
  {region: "us-central1", memory: "512MiB", timeoutSeconds: 60},
  async (request) => {
    const administrator = await requireAdminPermission(request, "product_categories", "write");
    const input = request.data && typeof request.data === "object" ? request.data as Record<string, unknown> : {};
    const id = categoryId(input.id);
    const contentType = text(input.contentType).toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(contentType)) {
      throw new HttpsError("invalid-argument", "Choose a JPG, PNG, WebP, or AVIF category image.");
    }

    const reference = db.collection("categories").doc(id);
    const existing = await reference.get();
    if (!existing.exists) throw new HttpsError("not-found", "Product category not found.");

    let optimized: Buffer;
    try {
      optimized = await sharp(decodeIcon(input.base64))
        .rotate()
        .resize({width: 192, height: 192, fit: "contain", withoutEnlargement: true})
        .webp({quality: 82, effort: 4})
        .toBuffer();
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("invalid-argument", "The selected category image could not be processed.");
    }

    const bucket = getStorage().bucket();
    const path = `product-categories/${id}/icons/${Date.now()}-${randomUUID()}.webp`;
    const token = randomUUID();
    await bucket.file(path).save(optimized, {
      resumable: false,
      metadata: {
        contentType: "image/webp",
        cacheControl: "public, max-age=31536000, immutable",
        metadata: {firebaseStorageDownloadTokens: token, uploadedBy: administrator.uid},
      },
    });
    const iconUrl = downloadUrl(bucket.name, path, token);
    await reference.update({
      iconUrl,
      iconStoragePath: path,
      icon: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: administrator.uid,
    });

    const previousPath = text(existing.data()?.iconStoragePath, 1_000);
    if (previousPath && previousPath !== path) {
      await bucket.file(previousPath).delete({ignoreNotFound: true});
    }
    await writeAdminAuditLog(administrator, {action: "product_category.icon_uploaded", targetType: "productCategory", targetId: id});
    return {success: true, iconUrl};
  },
);

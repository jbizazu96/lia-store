import * as admin from "firebase-admin";
import {randomUUID} from "crypto";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import sharp from "sharp";
import {requireAdminPermission} from "../admin/adminAuthorizationService";
import {writeAdminAuditLog} from "../admin/adminAuditLogService";

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

function sizeUnitId(value: unknown): string {
  const id = text(value, 20).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,19}$/.test(id)) {
    throw new HttpsError("invalid-argument", "Use a unit code containing only lowercase letters, numbers, or hyphens.");
  }
  return id;
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
  return {categories: snapshot.docs.map((document) => ({id: document.id, name: text(document.data().name) || "Unnamed category", iconUrl: text(document.data().iconUrl, 2_000), freshnessEligible: document.data().freshnessEligible === true})).sort((first, second) => first.name.localeCompare(second.name))};
});

export const createAdminProductCategory = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "product_categories", "write");
  const input = request.data && typeof request.data === "object" ? request.data as Record<string, unknown> : {};
  const name = text(input.name);
  const freshnessEligible = input.freshnessEligible === true;
  const id = slug(name);
  if (name.length < 2 || !id) throw new HttpsError("invalid-argument", "Enter a category name with at least two characters.");
  await requireUniqueName(name);
  const reference = db.collection("categories").doc(id);
  try {
    await reference.create({name, freshnessEligible, normalizedName: name.toLowerCase(), createdAt: FieldValue.serverTimestamp(), createdBy: administrator.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: administrator.uid});
  } catch (error) {
    if ((error as {code?: unknown}).code === 6 || (error as {code?: unknown}).code === "already-exists") {
      throw new HttpsError("already-exists", "That category ID is already in use. Edit the existing category instead.");
    }
    throw error;
  }
  await writeAdminAuditLog(administrator, {action: "product_category.created", targetType: "productCategory", targetId: id, details: {name}});
  return {id};
});

export const updateAdminProductCategory = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "product_categories", "write");
  const input = request.data && typeof request.data === "object" ? request.data as Record<string, unknown> : {};
  const id = categoryId(input.id);
  const name = text(input.name);
  const freshnessEligible = input.freshnessEligible === true;
  if (name.length < 2) throw new HttpsError("invalid-argument", "Enter a category name with at least two characters.");
  const reference = db.collection("categories").doc(id);
  const existing = await reference.get();
  if (!existing.exists) throw new HttpsError("not-found", "Product category not found.");
  await requireUniqueName(name, id);
  await reference.update({name, freshnessEligible, normalizedName: name.toLowerCase(), icon: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(), updatedBy: administrator.uid});
  const summaries = await db.collectionGroup("productCategorySummaries").where("categoryId", "==", id).get();
  if (!summaries.empty) {
    const writer = db.bulkWriter();
    summaries.docs.forEach((summary) => writer.update(summary.ref, {name, updatedAt: FieldValue.serverTimestamp()}));
    await writer.close();
  }
  await writeAdminAuditLog(administrator, {action: "product_category.renamed", targetType: "productCategory", targetId: id, details: {previousName: text(existing.data()?.name), name}});
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

/*
|--------------------------------------------------------------------------
| Protected Store Product Callables
|--------------------------------------------------------------------------
|
| Product inventory is private store data. The browser may request a change,
| but it never chooses the store, writes processing fields, or updates sales
| and review counters. Those values belong to trusted workflows only.
|
*/

import * as admin from "firebase-admin";
import {createHash} from "crypto";
import {
  AggregateField,
  FieldValue,
  getFirestore,
  Query,
} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import {createCatalogSearchTokens, normalizeCatalogSearchText} from "../services/catalog/catalogSearchTokens";
import {enforceCallableAbuseProtection} from "../security/callableAbuseProtection";
import {isConfiguredLowStock, normalizeStoreSku, retailInventoryValue} from "../services/store/storeInventoryPolicy";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");
const STORE_PRODUCT_INDEX_VERSION = 2;
const DEFAULT_PRODUCT_PAGE_SIZE = 25;
const MAXIMUM_PRODUCT_PAGE_SIZE = 50;
const DEFAULT_LOW_STOCK_THRESHOLD = 10;

async function configuredLowStockThreshold(): Promise<number> {
  const value = Number((await db.collection("settings").doc("productCatalog").get()).data()?.lowStockThreshold);
  return Number.isInteger(value) && value >= 0 && value <= 100_000
    ? value
    : DEFAULT_LOW_STOCK_THRESHOLD;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, maximum = 500): string {
  return typeof value === "string"
    ? value.trim().slice(0, maximum)
    : "";
}

function optionalText(value: unknown, maximum = 500): string | undefined {
  const normalized = text(value, maximum);
  return normalized || undefined;
}

function titleCaseBrand(value: string): string {
  return value.replace(
    /(^|[\s\-'’])([A-Za-zÀ-ÖØ-öø-ÿ])/g,
    (_match, separator: string, letter: string) => `${separator}${letter.toUpperCase()}`,
  );
}

function nonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new HttpsError("invalid-argument", `${field} must be a non-negative number.`);
  }

  return value;
}

function optionalSize(value: unknown): { value: number; unit: string } | null {
  if (value === null || value === undefined) {
    return null;
  }

  const size = record(value);
  const amount = nonNegativeNumber(size.value, "Product size");
  const unit = text(size.unit, 20);

  if (!unit || amount <= 0) {
    throw new HttpsError("invalid-argument", "Provide a valid product size.");
  }

  return { value: amount, unit };
}

function optionalPromotion(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null;
  }

  const promotion = record(value);
  const type = text(promotion.type, 30);

  if (type !== "discount" && type !== "bogo" && type !== "free_shipping") {
    throw new HttpsError("invalid-argument", "Select a valid promotion type.");
  }

  const discountPercentage = promotion.discountPercentage;
  const discountAmount = promotion.discountAmount;

  if (
    discountPercentage !== undefined &&
    (typeof discountPercentage !== "number" || !Number.isFinite(discountPercentage) || discountPercentage <= 0 || discountPercentage >= 100)
  ) {
    throw new HttpsError("invalid-argument", "Promotion percentage must be between 0 and 100.");
  }

  if (
    discountAmount !== undefined &&
    (typeof discountAmount !== "number" || !Number.isFinite(discountAmount) || discountAmount <= 0)
  ) {
    throw new HttpsError("invalid-argument", "Promotion amount must be greater than zero.");
  }

  if (type === "discount" && discountPercentage === undefined && discountAmount === undefined) {
    throw new HttpsError("invalid-argument", "A discount promotion needs a percentage or amount.");
  }

  const startsAt = optionalText(promotion.startsAt, 40);
  const endsAt = optionalText(promotion.endsAt, 40);

  if (startsAt && Number.isNaN(Date.parse(startsAt))) {
    throw new HttpsError("invalid-argument", "Promotion start date is invalid.");
  }

  if (endsAt && Number.isNaN(Date.parse(endsAt))) {
    throw new HttpsError("invalid-argument", "Promotion end date is invalid.");
  }

  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new HttpsError("invalid-argument", "Promotion end date must be after its start date.");
  }

  return {
    id: optionalText(promotion.id, 100) ?? "",
    title: optionalText(promotion.title, 160) ?? "",
    description: optionalText(promotion.description, 1_000) ?? "",
    imageUrl: optionalText(promotion.imageUrl, 2_000) ?? "",
    type,
    isActive: promotion.isActive !== false,
    ...(startsAt ? { startsAt } : {}),
    ...(endsAt ? { endsAt } : {}),
    ...(discountPercentage !== undefined ? { discountPercentage } : {}),
    ...(discountAmount !== undefined ? { discountAmount } : {}),
  };
}

/* Only store-editable catalog fields may cross the callable boundary. */
function editableProductData(
  value: unknown,
  requireCompleteProduct = true,
): Record<string, unknown> {
  const product = record(value);
  const name = text(product.name, 200);
  const description = text(product.description, 4_000);
  const category = text(product.category, 100);
  const sku = text(product.sku, 120);

  if (requireCompleteProduct && (!name || !category)) {
    throw new HttpsError("invalid-argument", "Product name and category are required.");
  }

  const data: Record<string, unknown> = {};

  if (requireCompleteProduct || product.name !== undefined) data.name = name;
  if (requireCompleteProduct || product.description !== undefined) data.description = description;
  if (requireCompleteProduct || product.category !== undefined) data.category = category;
  if (requireCompleteProduct || product.brand !== undefined) {
    const brand = optionalText(product.brand, 160);
    data.brand = brand ? titleCaseBrand(brand) : null;
  }
  if (requireCompleteProduct || product.price !== undefined) data.price = nonNegativeNumber(product.price, "Product price");
  if (requireCompleteProduct || product.stock !== undefined) data.stock = Math.floor(nonNegativeNumber(product.stock, "Product stock"));
  if (requireCompleteProduct || product.lowStockThreshold !== undefined) data.lowStockThreshold = Math.floor(nonNegativeNumber(product.lowStockThreshold ?? 10, "Low-stock threshold"));
  if (requireCompleteProduct || product.sku !== undefined) data.sku = sku;
  if (requireCompleteProduct || product.isAvailable !== undefined) data.isAvailable = product.isAvailable !== false;
  if (requireCompleteProduct || product.featured !== undefined) data.featured = product.featured === true;
  if (requireCompleteProduct || product.size !== undefined) data.size = optionalSize(product.size);
  if (requireCompleteProduct || product.promotion !== undefined) data.promotion = optionalPromotion(product.promotion);

  if (!requireCompleteProduct && Object.keys(data).length === 0) {
    throw new HttpsError("invalid-argument", "Provide at least one editable product field.");
  }

  return data;
}

async function ownedStore(uid: string) {
  const user = await db.collection("users").doc(uid).get();

  if (user.data()?.accountType !== "store_owner") {
    throw new HttpsError("permission-denied", "Only store owners can manage products.");
  }

  const storeId = typeof user.data()?.storeId === "string"
    ? user.data()!.storeId.trim()
    : "";
  const store = storeId
    ? await db.collection("stores").doc(storeId).get()
    : null;

  if (
    !store?.exists ||
    store.data()?.ownerId !== uid ||
    store.data()?.isApproved !== true ||
    store.data()?.onboardingCompleted !== true
  ) {
    throw new HttpsError("permission-denied", "Your approved store is required to manage products.");
  }

  return store;
}

function productSearchFields(data: Record<string, unknown>) {
  const price = typeof data.price === "number" && Number.isFinite(data.price)
    ? Math.max(0, data.price)
    : 0;
  const stock = typeof data.stock === "number" && Number.isFinite(data.stock)
    ? Math.max(0, Math.floor(data.stock))
    : 0;
  const threshold = typeof data.lowStockThreshold === "number" && Number.isFinite(data.lowStockThreshold) ? Math.max(0, Math.floor(data.lowStockThreshold)) : 10;

  return {
    nameSearch: text(data.name, 200).toLocaleLowerCase("en-US"),
    searchTokens: createCatalogSearchTokens([
      data.name,
      data.description,
      data.category,
      data.brand,
      data.sku,
    ]),
    inventoryValue: retailInventoryValue(price, stock),
    isLowStock: isConfiguredLowStock(stock, threshold),
  };
}

function normalizedSku(value: unknown): string {
  return normalizeStoreSku(value);
}

function skuReservationReference(storeId: string, sku: string) {
  const digest = createHash("sha256").update(sku).digest("hex");
  return db.collection("stores").doc(storeId).collection("productSkus").doc(digest);
}

function inventoryAuditData(input: {storeId: string; productId: string; productName: string; action: string; actorUid: string; previous?: Record<string, unknown>; next?: Record<string, unknown>}) {
  return {...input, source: "store", createdAt: FieldValue.serverTimestamp()};
}

/*
 * Existing development inventories predate the server-side search fields.
 * Upgrade each store exactly once, in bounded batches, so every subsequent
 * page request can remain indexed and paginated.
 */
async function ensureStoreProductIndex(store: FirebaseFirestore.DocumentSnapshot) {
  if (store.data()?.productIndexVersion === STORE_PRODUCT_INDEX_VERSION) return;

  let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  while (true) {
    let query = db.collection("products")
      .where("storeId", "==", store.id)
      .orderBy("__name__")
      .limit(400);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) break;

    const batch = db.batch();
    page.docs.forEach((product) => {
      const data = product.data();
      batch.update(product.ref, {...productSearchFields(data), isArchived: data.isArchived === true});
    });
    await batch.commit();
    cursor = page.docs.at(-1) ?? null;
    if (page.size < 400) break;
  }

  await store.ref.set({
    productIndexVersion: STORE_PRODUCT_INDEX_VERSION,
    productIndexUpdatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
}

function requestedPageSize(value: unknown): number {
  const requested = typeof value === "number" ? Math.floor(value) : DEFAULT_PRODUCT_PAGE_SIZE;
  return Math.min(Math.max(requested, 1), MAXIMUM_PRODUCT_PAGE_SIZE);
}

async function inventoryStats(storeId: string) {
  const inventory = db.collection("products").where("storeId", "==", storeId).where("isArchived", "==", false);
  const [all, active, featured, outOfStock, imageIssues] = await Promise.all([
    inventory.aggregate({
      totalProducts: AggregateField.count(),
      totalStock: AggregateField.sum("stock"),
      totalValue: AggregateField.sum("inventoryValue"),
    }).get(),
    inventory.where("isAvailable", "==", true).count().get(),
    inventory.where("featured", "==", true).count().get(),
    inventory.where("stock", "==", 0).count().get(),
    inventory.where("imageStatus", "==", "failed").count().get(),
  ]);

  return {
    totalProducts: all.data().totalProducts,
    activeProducts: active.data().count,
    featuredProducts: featured.data().count,
    totalStock: all.data().totalStock ?? 0,
    totalValue: all.data().totalValue ?? 0,
    outOfStockProducts: outOfStock.data().count,
    imageIssueProducts: imageIssues.data().count,
  };
}

function productId(value: unknown): string {
  const id = text(value, 200);

  if (!id || id.includes("/")) {
    throw new HttpsError("invalid-argument", "A valid product ID is required.");
  }

  return id;
}

function serializable(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date ? date.toISOString() : null;
  }

  if (Array.isArray(value)) {
    return value.map(serializable);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, serializable(entry)]));
  }

  return value;
}

async function requireConfiguredCategory(value: unknown): Promise<void> {
  const category = text(value, 100);
  if (!category || category.includes("/") || !(await db.collection("categories").doc(category).get()).exists) {
    throw new HttpsError("failed-precondition", "Choose a category currently configured by LIA Admin.");
  }
}

async function requireConfiguredSizeUnit(value: unknown): Promise<void> {
  if (value === null || value === undefined) return;
  const unit = text(record(value).unit, 20).toLowerCase();
  if (!unit || !(await db.collection("productSizeUnits").doc(unit).get()).exists) {
    throw new HttpsError("failed-precondition", "Choose a size unit currently configured by LIA Admin.");
  }
}

export const mutateStoreProduct = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in to manage products.");
  }

  const input = record(request.data);
  const action = text(input.action, 40);
  const store = await ownedStore(request.auth.uid);
  const lowStockThreshold = await configuredLowStockThreshold();
  if (action === "create" || action === "duplicate") {
    await enforceCallableAbuseProtection({
      operation: `store-product-${action}`,
      uid: request.auth.uid,
      appCheckVerified: Boolean(request.app),
      maximumRequests: 30,
      windowSeconds: 3_600,
    });
  }
  if (action === "create") {
    const data = editableProductData(input.product);
    data.lowStockThreshold = lowStockThreshold;
    data.sku = normalizedSku(data.sku);
    await requireConfiguredCategory(data.category);
    await requireConfiguredSizeUnit(data.size);
    const primaryImageId = optionalText(record(input.product).primaryImageId, 200);
    const created = db.collection("products").doc();
    await db.runTransaction(async (transaction) => {
      const sku = normalizedSku(data.sku);
      const reservation = sku ? skuReservationReference(store.id, sku) : null;
      if (reservation && (await transaction.get(reservation)).exists) throw new HttpsError("already-exists", "That SKU is already assigned to another product.");
      transaction.create(created, {...data, ...productSearchFields(data), storeId: store.id, isArchived: false, imageUrl: "", imageVariants: null, primaryImageId: primaryImageId ?? null, imageStatus: primaryImageId ? "uploading" : "none", originalImagePath: null, optimizedImagePath: null, imageError: null, rating: 0, reviewCount: 0, soldCount: 0, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
      if (reservation) transaction.create(reservation, {sku, productId: created.id, createdAt: FieldValue.serverTimestamp()});
      transaction.create(db.collection("storeInventoryAuditLogs").doc(), inventoryAuditData({storeId: store.id, productId: created.id, productName: String(data.name), action: "product_created", actorUid: request.auth!.uid, next: data}));
    });

    return { productId: created.id };
  }

  if (action === "bulk_update") {
    const ids = Array.isArray(input.productIds) ? [...new Set(input.productIds.map((value) => productId(value)))].slice(0, 100) : [];
    const available = input.isAvailable;
    if (ids.length === 0 || typeof available !== "boolean") throw new HttpsError("invalid-argument", "Choose products and a valid bulk action.");
    await enforceCallableAbuseProtection({operation: "store-product-bulk-update", uid: request.auth.uid, appCheckVerified: Boolean(request.app), maximumRequests: 20, windowSeconds: 600});
    const snapshots = await db.getAll(...ids.map((id) => db.collection("products").doc(id)));
    if (snapshots.some((item) => !item.exists || item.data()?.storeId !== store.id || item.data()?.isArchived === true)) throw new HttpsError("permission-denied", "One or more selected products are unavailable.");
    const batch = db.batch();
    snapshots.forEach((item) => {
      batch.update(item.ref, {isAvailable: available, updatedAt: FieldValue.serverTimestamp()});
      batch.create(db.collection("storeInventoryAuditLogs").doc(), inventoryAuditData({storeId: store.id, productId: item.id, productName: text(item.data()?.name, 200), action: available ? "bulk_activated" : "bulk_deactivated", actorUid: request.auth!.uid, previous: {isAvailable: item.data()?.isAvailable}, next: {isAvailable: available}}));
    });
    await batch.commit();
    return {updated: ids.length};
  }

  if (action === "bulk_inventory") {
    const rows = Array.isArray(input.rows) ? input.rows.slice(0, 100).map(record) : [];
    if (rows.length === 0) throw new HttpsError("invalid-argument", "The inventory file contains no valid rows.");
    await enforceCallableAbuseProtection({operation: "store-product-bulk-inventory", uid: request.auth.uid, appCheckVerified: Boolean(request.app), maximumRequests: 10, windowSeconds: 600});
    await db.runTransaction(async (transaction) => {
      const references = rows.map((row) => db.collection("products").doc(productId(row.productId)));
      const snapshots = await Promise.all(references.map((reference) => transaction.get(reference)));
      snapshots.forEach((snapshot, index) => {
        const row = rows[index];
        if (!snapshot.exists || snapshot.data()?.storeId !== store.id || snapshot.data()?.isArchived === true) throw new HttpsError("permission-denied", "One or more imported products are unavailable.");
        const current = snapshot.data() ?? {};
        const stock = row.stock === undefined || row.stock === "" ? Number(current.stock) : Math.floor(nonNegativeNumber(Number(row.stock), "Product stock"));
        const price = row.price === undefined || row.price === "" ? Number(current.price) : nonNegativeNumber(Number(row.price), "Product price");
        transaction.update(snapshot.ref, {stock, price, lowStockThreshold, isLowStock: isConfiguredLowStock(stock, lowStockThreshold), inventoryValue: stock * price, updatedAt: FieldValue.serverTimestamp()});
        transaction.create(db.collection("storeInventoryAuditLogs").doc(), inventoryAuditData({storeId: store.id, productId: snapshot.id, productName: text(current.name, 200), action: "csv_inventory_update", actorUid: request.auth!.uid, previous: {stock: current.stock, price: current.price}, next: {stock, price}}));
      });
    });
    return {updated: rows.length};
  }

  const id = productId(input.productId);
  const reference = db.collection("products").doc(id);
  const existing = await reference.get();

  if (!existing.exists || existing.data()?.storeId !== store.id) {
    throw new HttpsError("permission-denied", "This product does not belong to your store.");
  }

  if (action === "delete" || action === "archive") {
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(reference);
      if (!current.exists || current.data()?.storeId !== store.id) throw new HttpsError("not-found", "The product could not be found.");
      const currentData = current.data() ?? {};
      const sku = normalizedSku(currentData.sku);
      transaction.update(reference, {isArchived: true, isAvailable: false, featured: false, archivedAt: FieldValue.serverTimestamp(), archivedBy: request.auth!.uid, updatedAt: FieldValue.serverTimestamp()});
      if (sku) transaction.delete(skuReservationReference(store.id, sku));
      transaction.create(db.collection("storeInventoryAuditLogs").doc(), inventoryAuditData({storeId: store.id, productId: id, productName: text(currentData.name, 200), action: "product_archived", actorUid: request.auth!.uid, previous: {stock: currentData.stock, price: currentData.price, sku}}));
    });
    return { productId: id };
  }

  if (action === "discard_failed_creation") {
    const data = existing.data() ?? {};
    const createdAt = data.createdAt?.toDate?.();
    if (!(createdAt instanceof Date) || Date.now() - createdAt.getTime() > 60 * 60 * 1_000 || data.imageStatus === "ready" || Number(data.soldCount) > 0) {
      throw new HttpsError("failed-precondition", "Only a newly created product with an unsuccessful image upload can be discarded.");
    }
    const sku = normalizedSku(data.sku);
    if (sku) await skuReservationReference(store.id, sku).delete();
    await db.recursiveDelete(reference);
    await db.collection("storeInventoryAuditLogs").add(inventoryAuditData({storeId: store.id, productId: id, productName: text(data.name, 200), action: "failed_creation_discarded", actorUid: request.auth.uid}));
    return {productId: id};
  }

  if (action === "duplicate") {
    const data = editableProductData(existing.data());
    data.lowStockThreshold = lowStockThreshold;
    data.sku = "";
    await requireConfiguredCategory(data.category);
    const created = await db.collection("products").add({
      ...data,
      name: `${data.name} (Copy)`,
      ...productSearchFields({...data, name: `${data.name} (Copy)`}),
      storeId: store.id,
      isArchived: false,
      isAvailable: false,
      featured: false,
      imageUrl: "",
      imageVariants: null,
      primaryImageId: null,
      imageStatus: "none",
      originalImagePath: null,
      optimizedImagePath: null,
      imageError: null,
      rating: 0,
      reviewCount: 0,
      soldCount: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { productId: created.id };
  }

  if (action === "update") {
    const updates = editableProductData(input.product, false);
    updates.lowStockThreshold = lowStockThreshold;
    if (updates.sku !== undefined) updates.sku = normalizedSku(updates.sku);
    if (updates.category !== undefined) await requireConfiguredCategory(updates.category);
    if (updates.size !== undefined) {
      const previousUnit = text(record(existing.data()?.size).unit, 20).toLowerCase();
      const nextUnit = text(record(updates.size).unit, 20).toLowerCase();
      if (nextUnit && nextUnit !== previousUnit) await requireConfiguredSizeUnit(updates.size);
    }
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(reference);
      if (!current.exists || current.data()?.storeId !== store.id || current.data()?.isArchived === true) throw new HttpsError("not-found", "The product could not be found.");
      const currentData = current.data() ?? {};
      if (input.expectedStock !== undefined && Number(input.expectedStock) !== Number(currentData.stock)) {
        throw new HttpsError("aborted", "Inventory changed after you opened this product. Reload it and apply your stock change again.");
      }
      const previousSku = normalizedSku(currentData.sku);
      const nextSku = updates.sku === undefined ? previousSku : normalizedSku(updates.sku);
      if (nextSku !== previousSku && nextSku) {
        const nextReservation = skuReservationReference(store.id, nextSku);
        const reserved = await transaction.get(nextReservation);
        if (reserved.exists && reserved.data()?.productId !== id) throw new HttpsError("already-exists", "That SKU is already assigned to another product.");
        transaction.set(nextReservation, {sku: nextSku, productId: id, createdAt: FieldValue.serverTimestamp()});
      }
      if (previousSku && nextSku !== previousSku) transaction.delete(skuReservationReference(store.id, previousSku));
      const merged: Record<string, unknown> = {...currentData, ...updates, sku: nextSku};
      transaction.update(reference, {...updates, sku: nextSku, ...productSearchFields(merged), updatedAt: FieldValue.serverTimestamp()});
      transaction.create(db.collection("storeInventoryAuditLogs").doc(), inventoryAuditData({storeId: store.id, productId: id, productName: text(merged.name, 200), action: "product_updated", actorUid: request.auth!.uid, previous: {stock: currentData.stock, price: currentData.price, isAvailable: currentData.isAvailable, featured: currentData.featured, sku: previousSku}, next: {stock: merged.stock, price: merged.price, isAvailable: merged.isAvailable, featured: merged.featured, sku: nextSku}}));
    });

    return { productId: id };
  }

  throw new HttpsError("invalid-argument", "The product action is invalid.");
});

/* Private inventory reads are callable-only; return no owner or image-path fields. */
export const getOwnedStoreProducts = onCall({region: "us-central1", timeoutSeconds: 300}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in to view products.");
  }

  const store = await ownedStore(request.auth.uid);
  await ensureStoreProductIndex(store);
  const input = record(request.data);
  const mode = text(input.mode, 20) || "overview";
  const search = normalizeCatalogSearchText(text(input.search, 100));
  await enforceCallableAbuseProtection({
    operation: search ? "store-product-search" : "store-product-inventory",
    uid: request.auth.uid,
    appCheckVerified: Boolean(request.app),
    maximumRequests: search ? 90 : 240,
    windowSeconds: 600,
  });
  const stats = await inventoryStats(store.id);

  if (mode === "overview") {
    const summaries = await store.ref.collection("productCategorySummaries").orderBy("name").get();
    if (!summaries.empty) {
      const rows = summaries.docs.map((summary) => {
        const data = summary.data();
        return {
          id: summary.id,
          name: text(data.name, 100) || summary.id,
          count: Number(data.count) || 0,
          products: Array.isArray(data.products) ? data.products.map((product) => record(serializable(product))) : [],
        };
      }).filter((row) => row.count > 0);
      return {storeId: store.id, stats, categories: rows, products: [], filteredCount: stats.totalProducts, filteredStats: {active: stats.activeProducts, outOfStock: stats.outOfStockProducts, imageIssues: stats.imageIssueProducts}, nextCursor: null};
    }
    const categories = await db.collection("categories").orderBy("name").get();
    const rows = await Promise.all(categories.docs.map(async (category) => {
      const products = db.collection("products")
        .where("storeId", "==", store.id)
        .where("isArchived", "==", false)
        .where("category", "==", category.id);
      const [count, preview] = await Promise.all([
        products.count().get(),
        products.orderBy("nameSearch").limit(10).get(),
      ]);
      return {
        id: category.id,
        name: text(category.data().name, 100) || category.id,
        count: count.data().count,
        products: preview.docs.map((document) => ({
          id: document.id,
          ...record(serializable(document.data())),
        })),
      };
    }));

    return {storeId: store.id, stats, categories: rows.filter((row) => row.count > 0), products: [], filteredCount: stats.totalProducts, filteredStats: {active: stats.activeProducts, outOfStock: stats.outOfStockProducts, imageIssues: stats.imageIssueProducts}, nextCursor: null};
  }

  const category = text(input.category, 100);
  const status = text(input.status, 20);
  const requestedSort = text(input.sort, 30);
  const sort = !search && (!status || status === "all") && ["name", "stock_asc", "stock_desc", "price_asc", "price_desc", "updated_desc"].includes(requestedSort) ? requestedSort : "name";
  const searchToken = search.length >= 2 ? search.slice(0, 40) : "";
  const pageSize = requestedPageSize(input.pageSize);
  const cursor = text(input.cursor, 200);

  let products: Query = db.collection("products").where("storeId", "==", store.id).where("isArchived", "==", false);
  if (category && category !== "all") products = products.where("category", "==", category);
  if (status === "active") products = products.where("isAvailable", "==", true);
  if (status === "inactive") products = products.where("isAvailable", "==", false);
  if (status === "out_of_stock") products = products.where("stock", "==", 0);
  if (status === "low_stock") products = products.where("isLowStock", "==", true);
  if (status === "image_issues") products = products.where("imageStatus", "==", "failed");
  if (searchToken) products = products.where("searchTokens", "array-contains", searchToken);
  const filteredCount = await products.count().get();
  const [filteredActive, filteredOutOfStock, filteredImageIssues] = await Promise.all([
    products.where("isAvailable", "==", true).count().get(),
    products.where("stock", "==", 0).count().get(),
    products.where("imageStatus", "==", "failed").count().get(),
  ]);
  if (sort === "stock_asc") products = products.orderBy("stock", "asc");
  else if (sort === "stock_desc") products = products.orderBy("stock", "desc");
  else if (sort === "price_asc") products = products.orderBy("price", "asc");
  else if (sort === "price_desc") products = products.orderBy("price", "desc");
  else if (sort === "updated_desc") products = products.orderBy("updatedAt", "desc");
  else products = products.orderBy("nameSearch");
  products = products.orderBy("__name__", sort.endsWith("desc") ? "desc" : "asc").limit(pageSize);

  if (cursor) {
    const cursorProduct = await db.collection("products").doc(cursor).get();
    if (!cursorProduct.exists || cursorProduct.data()?.storeId !== store.id) {
      throw new HttpsError("invalid-argument", "The product-page cursor is invalid.");
    }
    products = products.startAfter(cursorProduct);
  }

  const snapshot = await products.get();
  return {
    storeId: store.id,
    stats,
    categories: [],
    filteredCount: filteredCount.data().count,
    filteredStats: {
      active: filteredActive.data().count,
      outOfStock: filteredOutOfStock.data().count,
      imageIssues: filteredImageIssues.data().count,
    },
    products: snapshot.docs.map((document) => ({id: document.id, ...record(serializable(document.data()))})),
    nextCursor: snapshot.size === pageSize ? snapshot.docs.at(-1)?.id ?? null : null,
  };
});

export const getOwnedStoreProduct = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in to view a product.");
  }

  const store = await ownedStore(request.auth.uid);
  const id = productId(record(request.data).productId);
  const product = await db.collection("products").doc(id).get();

  if (!product.exists || product.data()?.storeId !== store.id) {
    throw new HttpsError("not-found", "The product could not be found.");
  }

  return { product: { id: product.id, ...record(serializable(product.data())) } };
});

export const getStoreInventoryAudit = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view inventory history.");
  const store = await ownedStore(request.auth.uid);
  const input = record(request.data);
  const requested = Number(input.pageSize);
  const pageSize = Number.isInteger(requested) ? Math.min(50, Math.max(1, requested)) : 20;
  let query: Query = db.collection("storeInventoryAuditLogs").where("storeId", "==", store.id).orderBy("createdAt", "desc").limit(pageSize);
  const cursor = text(input.cursor, 200);
  if (cursor) {
    const document = await db.collection("storeInventoryAuditLogs").doc(cursor).get();
    if (!document.exists || document.data()?.storeId !== store.id) throw new HttpsError("invalid-argument", "The inventory-history cursor is invalid.");
    query = query.startAfter(document);
  }
  const page = await query.get();
  return {entries: page.docs.map((item) => ({id: item.id, ...record(serializable(item.data()))})), nextCursor: page.size === pageSize ? page.docs.at(-1)?.id ?? null : null};
});

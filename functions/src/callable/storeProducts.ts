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
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");

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

export const mutateStoreProduct = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in to manage products.");
  }

  const store = await ownedStore(request.auth.uid);
  const input = record(request.data);
  const action = text(input.action, 40);

  if (action === "create") {
    const data = editableProductData(input.product);
    await requireConfiguredCategory(data.category);
    const primaryImageId = optionalText(record(input.product).primaryImageId, 200);
    const created = await db.collection("products").add({
      ...data,
      storeId: store.id,
      imageUrl: "",
      imageVariants: null,
      primaryImageId: primaryImageId ?? null,
      imageStatus: primaryImageId ? "uploading" : "none",
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

  const id = productId(input.productId);
  const reference = db.collection("products").doc(id);
  const existing = await reference.get();

  if (!existing.exists || existing.data()?.storeId !== store.id) {
    throw new HttpsError("permission-denied", "This product does not belong to your store.");
  }

  if (action === "delete") {
    /*
     * Delete nested gallery-image metadata as well as the parent product.
     * A product creation that cannot upload its required image is rolled back
     * by the browser; recursive deletion prevents failed gallery documents
     * from remaining behind after that rollback.
     */
    await db.recursiveDelete(reference);
    return { productId: id };
  }

  if (action === "duplicate") {
    const data = editableProductData(existing.data());
    await requireConfiguredCategory(data.category);
    const created = await db.collection("products").add({
      ...data,
      name: `${data.name} (Copy)`,
      storeId: store.id,
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
    if (updates.category !== undefined) await requireConfiguredCategory(updates.category);
    await reference.update({
      ...updates,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { productId: id };
  }

  throw new HttpsError("invalid-argument", "The product action is invalid.");
});

/* Private inventory reads are callable-only; return no owner or image-path fields. */
export const getOwnedStoreProducts = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in to view products.");
  }

  const store = await ownedStore(request.auth.uid);
  const snapshot = await db.collection("products").where("storeId", "==", store.id).get();

  return {
    storeId: store.id,
    products: snapshot.docs.map((document) => ({ id: document.id, ...record(serializable(document.data())) })),
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

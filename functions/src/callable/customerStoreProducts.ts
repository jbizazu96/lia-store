/*
|--------------------------------------------------------------------------
| Customer Store Product Catalog Callable
|--------------------------------------------------------------------------
|
| Customer store pages use this callable instead of querying
| productPublicProfiles from the browser. The function returns only the
| customer-safe product projection and never reads private products/{id}
| inventory documents for the client.
|
*/

import * as admin from "firebase-admin";
import {
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
const DEFAULT_PRODUCT_PAGE_SIZE = 60;
const MAXIMUM_PRODUCT_PAGE_SIZE = 100;

function pageSize(value: unknown): number {
  const requested = typeof value === "number" ? Math.floor(value) : 0;
  return Math.min(
    MAXIMUM_PRODUCT_PAGE_SIZE,
    Math.max(1, requested || DEFAULT_PRODUCT_PAGE_SIZE)
  );
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function timestamp(value: unknown): string {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();

    return date instanceof Date ? date.toISOString() : "";
  }

  return typeof value === "string" ? value : "";
}

function publicProduct(
  productId: string,
  data: Record<string, unknown>
) {
  return {
    id: productId,
    storeId: text(data.storeId),
    name: text(data.name),
    description: text(data.description),
    category: text(data.category),
    brand: text(data.brand),
    price: number(data.price),
    stock: Math.max(0, Math.floor(number(data.stock))),
    imageUrl: text(data.imageUrl),
    imageVariants: data.imageVariants ?? null,
    primaryImageId: typeof data.primaryImageId === "string"
      ? data.primaryImageId
      : null,
    imageStatus: text(data.imageStatus) || "none",
    isAvailable: data.isAvailable !== false,
    featured: data.featured === true,
    size: data.size ?? null,
    rating: number(data.rating),
    reviewCount: Math.max(0, Math.floor(number(data.reviewCount))),
    soldCount: Math.max(0, Math.floor(number(data.soldCount))),
    promotion: data.promotion ?? null,
    createdAt: timestamp(data.createdAt),
    updatedAt: timestamp(data.updatedAt),
  };
}

export const getCustomerStoreProducts = onCall(
  {
    region: "us-central1",
  },
  async (request) => {
    const storeId = typeof request.data?.storeId === "string"
      ? request.data.storeId.trim()
      : "";
    const categoryValues = Array.isArray(request.data?.categoryValues)
      ? Array.from(new Set(request.data.categoryValues
        .map((value: unknown) => text(value).trim())
        .filter(Boolean)))
        .slice(0, 10)
      : [];
    const cursorName = text(request.data?.cursor?.name).trim();
    const cursorId = text(request.data?.cursor?.id).trim();
    const size = pageSize(request.data?.pageSize);

    if (!storeId || storeId.length > 200) {
      throw new HttpsError("invalid-argument", "The store ID is invalid.");
    }

    /*
     * A public profile is the visibility authority. A store that is inactive,
     * suspended, or awaiting approval has no profile and exposes no catalog.
     */
    const store = await db
      .collection("storePublicProfiles")
      .doc(storeId)
      .get();

    if (!store.exists) {
      throw new HttpsError("not-found", "This store is not available.");
    }

    let productQuery = db
      .collection("productPublicProfiles")
      .where("storeId", "==", storeId)
      .orderBy("name", "asc")
      .orderBy(admin.firestore.FieldPath.documentId(), "asc");

    if (categoryValues.length === 1) {
      productQuery = productQuery.where("category", "==", categoryValues[0]);
    } else if (categoryValues.length > 1) {
      productQuery = productQuery.where("category", "in", categoryValues);
    }

    if (cursorName && cursorId) {
      productQuery = productQuery.startAfter(cursorName, cursorId);
    }

    const products = await productQuery.limit(size + 1).get();
    const pageDocuments = products.docs.slice(0, size);
    const lastDocument = pageDocuments.at(-1);

    return {
      products: pageDocuments.map((product) =>
        publicProduct(product.id, product.data())
      ),
      hasMore: products.docs.length > size,
      nextCursor: lastDocument
        ? {name: text(lastDocument.data().name), id: lastDocument.id}
        : null,
    };
  }
);

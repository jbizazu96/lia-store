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
const MAXIMUM_STORE_PRODUCTS = 500;

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

    const products = await db
      .collection("productPublicProfiles")
      .where("storeId", "==", storeId)
      .limit(MAXIMUM_STORE_PRODUCTS)
      .get();

    return {
      products: products.docs.map((product) =>
        publicProduct(product.id, product.data())
      ),
    };
  }
);

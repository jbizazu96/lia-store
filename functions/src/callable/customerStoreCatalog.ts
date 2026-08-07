/*
|--------------------------------------------------------------------------
| Customer Store Catalog Callables
|--------------------------------------------------------------------------
|
| Customer discovery deliberately reads through Cloud Functions instead of
| attaching a browser Firestore listener. This keeps the private stores
| collection inaccessible to browsers and avoids coupling the customer home
| screen to Firestore Rules query behavior.
|
| The backing storePublicProfiles collection is already a server-managed,
| sanitized projection. We still use an explicit allowlist below so a future
| field added to that collection cannot accidentally become public.
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
const MAXIMUM_CATALOG_STORES = 200;

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

function schedule(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((day) => {
    if (!day || typeof day !== "object" || Array.isArray(day)) {
      return [];
    }

    const record = day as Record<string, unknown>;

    return [{
      day: text(record.day),
      open: text(record.open),
      close: text(record.close),
      isClosed: record.isClosed === true,
    }];
  });
}

function publicStore(
  storeId: string,
  data: Record<string, unknown>
) {
  return {
    id: storeId,
    name: text(data.name),
    description: text(data.description),
    phone: text(data.phone),
    email: text(data.email),
    address: text(data.address),
    city: text(data.city),
    state: text(data.state),
    zip: text(data.zip),
    country: text(data.country),
    latitude: number(data.latitude),
    longitude: number(data.longitude),
    placeId: text(data.placeId),
    formattedAddress: text(data.formattedAddress),
    logoUrl: text(data.logoUrl),
    bannerUrl: text(data.bannerUrl),
    category: text(data.category),
    rating: number(data.rating),
    reviewCount: Math.max(0, Math.floor(number(data.reviewCount))),
    minimumOrder: number(data.minimumOrder, 30),
    isApproved: data.isApproved === true,
    isActive: data.isActive === true,
    isOpen: data.isOpen === true,
    schedule: schedule(data.schedule),
    updatedAt: timestamp(data.updatedAt),
  };
}

/*
 * This catalog is public marketplace information, so authentication is not
 * required. No private store data is queried or returned by either callable.
 */
export const getCustomerStoreCatalog = onCall(
  {
    region: "us-central1",
  },
  async () => {
    const snapshot = await db
      .collection("storePublicProfiles")
      .orderBy("name", "asc")
      .limit(MAXIMUM_CATALOG_STORES)
      .get();

    return {
      stores: snapshot.docs.map((store) =>
        publicStore(store.id, store.data())
      ),
    };
  }
);

export const getCustomerStorePublicProfile = onCall(
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

    const store = await db
      .collection("storePublicProfiles")
      .doc(storeId)
      .get();

    if (!store.exists) {
      throw new HttpsError("not-found", "This store is not available.");
    }

    return {
      store: publicStore(store.id, store.data() ?? {}),
    };
  }
);

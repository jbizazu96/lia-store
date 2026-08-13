/*
|--------------------------------------------------------------------------
| Store Service
|--------------------------------------------------------------------------
|
| Responsible for retrieving public Store domain models from Firestore.
|
| Pages and components should not access the private stores collection
| directly. Customer discovery reads a server-managed public profile.
|
*/

/**
 * Convert Firestore store data into the shared Store domain model.
 *
 * Both getStore() and getStores() use this function so store mapping
 * remains consistent throughout the application.
 */

import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
} from "firebase/firestore";
import { isStoreActive, isStoreApproved } from "./storeAvailability";

import { db } from "@/lib/firebase";
import {
  loadCached,
} from "@/services/cache/clientDataCache";
import type { Store } from "@/types/store";

type PublicStoreDocument = Record<string, unknown>;
export interface StoreCatalogCursor { name: string; id: string }
export interface StoreCatalogPage {
  stores: Store[];
  hasMore: boolean;
  nextCursor: StoreCatalogCursor | null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value
    ? value
    : undefined;
}

function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function imageVariants(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string"
  ));
}

function schedule(value: unknown): Store["schedule"] {
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

function mapStoreDocument(
  storeId: string,
  data: PublicStoreDocument
): Store {
  return {
    id: storeId,
    /* Ownership and onboarding data never leave the callable boundary. */
    ownerId: "",

    name: text(data.name),
    description: text(data.description),

    phone: text(data.phone),
    email: text(data.email),

    address: text(data.address),
    city: text(data.city),
    state: text(data.state),
    zip: text(data.zip),
    country: optionalText(data.country),

    latitude: number(data.latitude),
    longitude: number(data.longitude),
    placeId: text(data.placeId),
    formattedAddress: text(data.formattedAddress),

    logoUrl: text(data.logoUrl),
    bannerUrl: text(data.bannerUrl),
    logoImageVariants: imageVariants(data.logoImageVariants),
    bannerImageVariants: imageVariants(data.bannerImageVariants),

    category: optionalText(data.category),
    rating: typeof data.rating === "number"
      ? number(data.rating)
      : undefined,
    reviewCount: typeof data.reviewCount === "number"
      ? Math.max(0, Math.floor(number(data.reviewCount)))
      : 0,

    distance: typeof data.distance === "number"
      ? number(data.distance)
      : undefined,
    deliveryFee: typeof data.deliveryFee === "number"
      ? number(data.deliveryFee)
      : undefined,

    minimumOrder: number(data.minimumOrder, 20),

    isApproved: isStoreApproved(data),
    isActive: isStoreActive(data),
    onboardingCompleted: false,
    onboardingStep: undefined,
    owner: undefined,
    isOpen: data.isOpen === true,
    schedule: schedule(data.schedule),

    createdAt: "",
    updatedAt: text(data.updatedAt),

    stripeAccountId: undefined,
    stripeConnectApiVersion: undefined,

    businessType: undefined,
    registeredName: undefined,
    ein: undefined,
    businessStructure: undefined,
    photoIdUrl: undefined,
    storeFrontUrl: undefined,
    storeInsideUrl: undefined,

    stripeEmail: undefined,
    stripePhone: undefined,
    stripeBusinessType: undefined,
    stripeAccountType: undefined,
  };
}

export const storeService = {
  async getStoresPage(
    cursor: StoreCatalogCursor | null = null,
    pageSize = 40,
  ): Promise<StoreCatalogPage> {
    const requestedSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
    const loadPage = async (): Promise<StoreCatalogPage> => {
      const constraints = [
        orderBy("name", "asc"),
        orderBy(documentId(), "asc"),
        ...(cursor ? [startAfter(cursor.name, cursor.id)] : []),
        limit(requestedSize + 1),
      ];
      const snapshot = await getDocs(query(
        collection(db, "storePublicProfiles"),
        ...constraints,
      ));
      const pageDocuments = snapshot.docs.slice(0, requestedSize);
      const lastDocument = pageDocuments.at(-1);

      return {
        stores: pageDocuments.map((storeDocument) =>
          mapStoreDocument(storeDocument.id, storeDocument.data())
        ),
        hasMore: snapshot.docs.length > requestedSize,
        nextCursor: lastDocument
          ? {name: text(lastDocument.data().name), id: lastDocument.id}
          : null,
      };
    };

    /*
     * The sanitized projection is publicly readable by design. Reading it
     * directly removes a Cloud Functions cold start from customer Home.
     * Cache only the first page, which is the critical visible catalog.
     */
    return cursor
      ? loadPage()
      : loadCached(
        `customer-store-catalog:first:${requestedSize}`,
        loadPage,
        {ttlMs: 30_000, scope: "public"},
      );
  },

  /**
   * Get all customer-visible stores from the server-managed public
   * projection. No private stores/{storeId} data is available to the browser.
   */
  async getStores(): Promise<Store[]> {
    return loadCached(
      "customer-store-catalog",
      async () => {
        const stores: Store[] = [];
        let cursor: StoreCatalogCursor | null = null;
        do {
          const page: StoreCatalogPage = await storeService.getStoresPage(cursor, 100);
          stores.push(...page.stores);
          cursor = page.hasMore ? page.nextCursor : null;
        } while (cursor);
        return stores;
      },
      { ttlMs: 15_000, scope: "public" },
    );
  },

  /**
   * Subscribe to store changes so customer discovery updates as soon as an
   * administrator activates a newly approved store.
   */
  listenToStores(
    onChange: (stores: Store[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    /*
     * The public projection contains only approved, active stores and carries
     * no owner, Stripe, business-registration, or document-review data.
     * This is appropriate for a direct real-time customer listener.
     */
    return onSnapshot(
      collection(db, "storePublicProfiles"),
      (snapshot) => {
        onChange(
          snapshot.docs.map((storeDocument) =>
            mapStoreDocument(
              storeDocument.id,
              storeDocument.data()
            )
          )
        );
      },
      (error) => onError?.(error)
    );
  },

  /**
   * Get one store by ID.
   */
  async getStore(
    storeId: string
  ): Promise<Store | null> {
    if (!storeId.trim()) return null;

    return loadCached(
      `customer-store:${storeId}`,
      async () => {
        const snapshot = await getDoc(
          doc(db, "storePublicProfiles", storeId)
        );

        if (!snapshot.exists()) return null;

        return mapStoreDocument(
          snapshot.id,
          snapshot.data()
        );
      },
      { ttlMs: 30_000, scope: "public" },
    );
  },

  /**
   * Subscribe to a single customer-visible store so name, opening status,
   * banner, and marketplace availability update without a page reload.
   */
  listenToStore(
    storeId: string,
    onChange: (store: Store | null) => void,
    onError?: (error: Error) => void
  ): () => void {
    if (!storeId.trim()) {
      onChange(null);
      return () => undefined;
    }

    return onSnapshot(
      doc(db, "storePublicProfiles", storeId),
      (snapshot) => {
        onChange(
          snapshot.exists()
            ? mapStoreDocument(snapshot.id, snapshot.data())
            : null
        );
      },
      (error) => onError?.(error)
    );
  },
};

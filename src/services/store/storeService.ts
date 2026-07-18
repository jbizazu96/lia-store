/*
|--------------------------------------------------------------------------
| Store Service
|--------------------------------------------------------------------------
|
| Responsible for retrieving Store domain models from Firestore.
|
| Pages and components should not access the stores collection directly.
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
  getDoc,
  getDocs,
  type DocumentData,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import type { Store } from "@/types/store";

function mapStoreDocument(
  storeId: string,
  data: DocumentData
): Store {
  return {
    id: storeId,
    ownerId: data.ownerId ?? "",

    name: data.name ?? "",
    description: data.description ?? "",

    phone: data.phone ?? "",
    email: data.email ?? "",

    address: data.address ?? "",
    city: data.city ?? "",
    state: data.state ?? "",
    zip: data.zip ?? "",

    latitude: data.latitude ?? 0,
    longitude: data.longitude ?? 0,
    placeId: data.placeId ?? "",
    formattedAddress: data.formattedAddress ?? "",

    logoUrl: data.logoUrl ?? "",
    bannerUrl: data.bannerUrl ?? "",

    category: data.category ?? undefined,
    rating: data.rating ?? undefined,

    distance: data.distance ?? undefined,
    deliveryFee: data.deliveryFee ?? undefined,

    minimumOrder: data.minimumOrder ?? 20,

    status: data.status ?? "pending",
    isOpen: data.isOpen ?? false,
    schedule: data.schedule ?? [],

    createdAt: data.createdAt ?? "",
    updatedAt: data.updatedAt ?? "",

    stripeAccountId: data.stripeAccountId ?? undefined,

    businessType: data.businessType ?? undefined,
    registeredName: data.registeredName ?? undefined,
    ein: data.ein ?? undefined,
    businessStructure: data.businessStructure ?? undefined,
    photoIdUrl: data.photoIdUrl ?? undefined,
    storeFrontUrl: data.storeFrontUrl ?? undefined,
    storeInsideUrl: data.storeInsideUrl ?? undefined,

    stripeEmail: data.stripeEmail ?? undefined,
    stripePhone: data.stripePhone ?? undefined,
    stripeBusinessType: data.stripeBusinessType ?? undefined,
    stripeAccountType: data.stripeAccountType ?? undefined,
  };
}

export const storeService = {
  /**
   * Get all stores.
   */
  async getStores(): Promise<Store[]> {
    const snapshot = await getDocs(
      collection(db, "stores")
    );

    return snapshot.docs.map((storeDocument) =>
      mapStoreDocument(
        storeDocument.id,
        storeDocument.data()
      )
    );
  },

  /**
   * Get one store by ID.
   */
  async getStore(
    storeId: string
  ): Promise<Store | null> {
    const snapshot = await getDoc(
      doc(db, "stores", storeId)
    );

    if (!snapshot.exists()) {
      return null;
    }

    return mapStoreDocument(
      snapshot.id,
      snapshot.data()
    );
  },
};
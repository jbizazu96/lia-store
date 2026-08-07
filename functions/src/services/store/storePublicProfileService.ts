/*
|--------------------------------------------------------------------------
| Store Public Profile Service
|--------------------------------------------------------------------------
|
| Mirrors the deliberately small, customer-safe portion of an approved and
| active store into storePublicProfiles. Private owner identity, business
| registration, document-review, and Stripe fields never cross this boundary.
|
*/

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {
  createCatalogSearchTokens,
} from "../catalog/catalogSearchTokens";

export interface StorePublicProfileSource {
  name?: unknown;
  description?: unknown;
  phone?: unknown;
  email?: unknown;
  address?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
  country?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  placeId?: unknown;
  formattedAddress?: unknown;
  logoUrl?: unknown;
  bannerUrl?: unknown;
  category?: unknown;
  rating?: unknown;
  minimumOrder?: unknown;
  isApproved?: unknown;
  isActive?: unknown;
  isOpen?: unknown;
  schedule?: unknown;
}

function publicText(
  value: unknown
): string {
  return typeof value === "string"
    ? value
    : "";
}

function publicNumber(
  value: unknown,
  fallback = 0
): number {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : fallback;
}

export async function syncStorePublicProfile(
  storeId: string,
  store: StorePublicProfileSource | undefined
): Promise<void> {
  const profileReference =
    getFirestore("default")
      .collection("storePublicProfiles")
      .doc(storeId);

  /*
   * Closed stores are still customer-visible. Approval and marketplace
   * activation control this projection; isOpen only controls whether the
   * customer can place an order at the current time.
   */
  if (
    store?.isApproved !== true ||
    store.isActive !== true
  ) {
    await profileReference.delete();
    return;
  }

  await profileReference.set(
    {
      name: publicText(store.name),
      description: publicText(store.description),
      phone: publicText(store.phone),
      email: publicText(store.email),
      address: publicText(store.address),
      city: publicText(store.city),
      state: publicText(store.state),
      zip: publicText(store.zip),
      country: publicText(store.country),
      latitude: publicNumber(store.latitude),
      longitude: publicNumber(store.longitude),
      placeId: publicText(store.placeId),
      formattedAddress: publicText(
        store.formattedAddress
      ),
      logoUrl: publicText(store.logoUrl),
      bannerUrl: publicText(store.bannerUrl),
      category: publicText(store.category),
      searchTokens: createCatalogSearchTokens([
        store.name,
        store.description,
        store.city,
        store.state,
        store.category,
      ]),
      rating: publicNumber(store.rating),
      minimumOrder: publicNumber(
        store.minimumOrder,
        30
      ),
      isApproved: true,
      isActive: true,
      isOpen: store.isOpen === true,
      schedule: Array.isArray(store.schedule)
        ? store.schedule
        : [],
      updatedAt: FieldValue.serverTimestamp(),
    },
    {
      merge: true,
    }
  );
}

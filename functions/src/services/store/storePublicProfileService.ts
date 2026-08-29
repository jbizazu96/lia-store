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
  logoImageVariants?: unknown;
  bannerImageVariants?: unknown;
  category?: unknown;
  rating?: unknown;
  reviewCount?: unknown;
  minimumOrder?: unknown;
  pickupEnabled?: unknown;
  pickupPreparationMinutes?: unknown;
  pickupInstructions?: unknown;
  scheduledPickupEnabled?: unknown;
  scheduledDeliveryEnabled?: unknown;
  scheduledOrdersPerSlot?: unknown;
  fulfillmentTimezone?: unknown;
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

function publicImageVariants(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string"
  ));
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
      logoImageVariants: publicImageVariants(store.logoImageVariants),
      bannerImageVariants: publicImageVariants(store.bannerImageVariants),
      category: publicText(store.category),
      searchTokens: createCatalogSearchTokens([
        store.name,
        store.description,
        store.city,
        store.state,
        store.category,
      ]),
      rating: publicNumber(store.rating),
      reviewCount: Math.max(0, Math.floor(publicNumber(store.reviewCount))),
      minimumOrder: publicNumber(
        store.minimumOrder,
        30
      ),
      pickupEnabled: store.pickupEnabled === true,
      pickupPreparationMinutes: Math.min(
        240,
        Math.max(5, Math.round(publicNumber(store.pickupPreparationMinutes, 30))),
      ),
      pickupInstructions: publicText(store.pickupInstructions),
      scheduledPickupEnabled: store.scheduledPickupEnabled === true,
      scheduledDeliveryEnabled: store.scheduledDeliveryEnabled === true,
      scheduledOrdersPerSlot: Math.min(100, Math.max(1, Math.round(publicNumber(store.scheduledOrdersPerSlot, 5)))),
      fulfillmentTimezone: publicText(store.fulfillmentTimezone) || "America/Chicago",
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

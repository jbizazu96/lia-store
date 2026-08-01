/*
|--------------------------------------------------------------------------
| Store Public Profile Synchronization
|--------------------------------------------------------------------------
|
| The private stores collection contains identity documents, business data,
| Stripe state, and review metadata. Customers must never read that document
| directly. This trigger mirrors only the marketplace fields that customers
| need into storePublicProfiles/{storeId}.
|
*/

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {
  onDocumentWritten,
} from "firebase-functions/v2/firestore";

interface StoreRecord {
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

function publicText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function publicNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

export const storePublicProfileSync = onDocumentWritten(
  {
    document: "stores/{storeId}",
    region: "us-central1",
    database: "default",
  },
  async (event) => {
    const storeId = event.params.storeId;
    const after = event.data?.after;
    const profileReference = getFirestore("default")
      .collection("storePublicProfiles")
      .doc(storeId);

    if (!after?.exists) {
      await profileReference.delete();
      return;
    }

    const store = after.data() as StoreRecord;

    /*
     * Do not leave draft, rejected, suspended, or inactive documents in the
     * public collection. This makes collection queries safe without relying
     * on the browser to supply a visibility filter.
     */
    if (store.isApproved !== true || store.isActive !== true) {
      await profileReference.delete();
      return;
    }

    /*
     * Keep this explicit allowlist. Do not spread the source document here:
     * that would silently expose new private store fields in the future.
     */
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
        formattedAddress: publicText(store.formattedAddress),
        logoUrl: publicText(store.logoUrl),
        bannerUrl: publicText(store.bannerUrl),
        category: publicText(store.category),
        rating: publicNumber(store.rating),
        minimumOrder: publicNumber(store.minimumOrder, 30),
        isApproved: true,
        isActive: true,
        isOpen: store.isOpen === true,
        schedule: Array.isArray(store.schedule) ? store.schedule : [],
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
);

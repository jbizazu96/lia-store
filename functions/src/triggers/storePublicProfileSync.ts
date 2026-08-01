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
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import {
  syncStorePublicProfile,
  type StorePublicProfileSource,
} from "../services/store/storePublicProfileService";

export const storePublicProfileSync = onDocumentWritten(
  {
    document: "stores/{storeId}",
    region: "us-central1",
    database: "default",
  },
  async (event) => {
    const storeId = event.params.storeId;
    const after = event.data?.after;
    await syncStorePublicProfile(
      storeId,
      after?.exists
        ? after.data() as StorePublicProfileSource
        : undefined
    );
  }
);

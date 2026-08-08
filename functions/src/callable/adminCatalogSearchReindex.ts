/*
 * Rebuilds the indexed, customer-safe catalog projections in small pages.
 * It is admin-only because it reads private source documents with the Admin
 * SDK; the customer browser never receives those documents.
 */

import * as admin from "firebase-admin";
import {
  FieldPath,
  getFirestore,
} from "firebase-admin/firestore";
import {
  onCall,
} from "firebase-functions/v2/https";
import {
  requireActiveAdmin,
} from "../admin/adminAuthorizationService";
import {
  writeAdminAuditLog,
} from "../admin/adminAuditLogService";
import {
  syncStorePublicProfile,
  type StorePublicProfileSource,
} from "../services/store/storePublicProfileService";
import {
  synchronizeStoreProductPublicProfiles,
  type PublicCatalogData,
} from "../triggers/productPublicProfileSync";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");
const MAXIMUM_STORES_PER_RUN = 25;

function cursor(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  if (!normalized || normalized.length > 200) {
    return null;
  }

  return normalized;
}

export const reindexAdminCatalogSearch = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (request) => {
    const administrator = await requireActiveAdmin(request);
    const afterStoreId = cursor(
      (request.data as { afterStoreId?: unknown } | undefined)?.afterStoreId,
    );
    let storesQuery = db.collection("stores")
      .orderBy(FieldPath.documentId())
      .limit(MAXIMUM_STORES_PER_RUN);

    if (afterStoreId) {
      storesQuery = storesQuery.startAfter(afterStoreId);
    }

    const stores = await storesQuery.get();

    for (const store of stores.docs) {
      const data = store.data() as PublicCatalogData;

      await syncStorePublicProfile(
        store.id,
        data as StorePublicProfileSource,
      );
      await synchronizeStoreProductPublicProfiles(store.id, data);
    }

    const nextAfterStoreId = stores.size === MAXIMUM_STORES_PER_RUN
      ? stores.docs.at(-1)?.id ?? null
      : null;

    await writeAdminAuditLog(administrator, {
      action: "catalog_search_reindexed",
      targetType: "catalog",
      targetId: "public-search",
      details: {
        storesProcessed: stores.size,
        hasMore: nextAfterStoreId !== null,
      },
    });

    return {
      success: true,
      storesProcessed: stores.size,
      nextAfterStoreId,
    };
  },
);

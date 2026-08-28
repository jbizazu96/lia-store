/*
|--------------------------------------------------------------------------
| Public Product Catalog Synchronization
|--------------------------------------------------------------------------
|
| products/{productId} is private inventory. This trigger mirrors only the
| customer-safe catalog fields into productPublicProfiles/{productId}. The
| public gallery contains processed image URLs only; original paths, errors,
| SKU, and store-only processing data never leave the private collection.
|
*/

import {
  FieldValue,
  getFirestore,
  WriteBatch,
} from "firebase-admin/firestore";
import {
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import {
  createCatalogSearchTokens,
} from "../services/catalog/catalogSearchTokens";

export type PublicCatalogData = Record<string, unknown>;
type Data = PublicCatalogData;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function publicStoreSearchSummary(
  storeId: string,
  store: Data,
) {
  return {
    id: storeId,
    name: text(store.name),
    logoUrl: text(store.logoUrl),
    rating: number(store.rating),
    latitude: number(store.latitude),
    longitude: number(store.longitude),
    address: text(store.address),
    formattedAddress: text(store.formattedAddress),
    phone: text(store.phone),
    isApproved: store.isApproved === true,
    isActive: store.isActive === true,
    isOpen: store.isOpen === true,
    schedule: Array.isArray(store.schedule) ? store.schedule : [],
  };
}

function publicProduct(
  data: Data,
  productId: string,
  store: Data,
) {
  return {
    id: productId,
    storeId: text(data.storeId),
    /*
     * Search must never fan out to one store read per product. Keep the
     * customer-safe store card data with every public product projection.
     */
    storeSummary: publicStoreSearchSummary(text(data.storeId), store),
    name: text(data.name),
    description: text(data.description),
    category: text(data.category),
    brand: text(data.brand),
    price: number(data.price),
    stock: Math.max(0, Math.floor(number(data.stock))),
    imageUrl: text(data.imageUrl),
    imageVariants: data.imageVariants ?? null,
    primaryImageId: typeof data.primaryImageId === "string" ? data.primaryImageId : null,
    imageStatus: text(data.imageStatus) || "none",
    isAvailable: data.isAvailable !== false,
    featured: data.featured === true,
    size: data.size ?? null,
    rating: number(data.rating),
    reviewCount: Math.max(0, Math.floor(number(data.reviewCount))),
    soldCount: Math.max(0, Math.floor(number(data.soldCount))),
    promotion: data.promotion ?? null,
    searchTokens: createCatalogSearchTokens([
      data.name,
      data.description,
      data.category,
      data.brand,
    ]),
    createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

async function publicStoreSource(storeId: string): Promise<Data | null> {
  if (!storeId) return null;
  /*
   * storePublicProfiles is the single customer-visibility authority used by
   * the catalog callables. Do not independently reinterpret the private store
   * document here: that can hide every product while the store itself remains
   * visible to customers.
   */
  const store = await getFirestore("default")
    .collection("storePublicProfiles")
    .doc(storeId)
    .get();
  const data = store.data() as Data | undefined;

  return store.exists && data?.isApproved === true && data.isActive === true
    ? data
    : null;
}

async function deletePublicProductProfile(productId: string): Promise<void> {
  await getFirestore("default")
    .recursiveDelete(
      getFirestore("default")
        .collection("productPublicProfiles")
        .doc(productId),
    );
}

/**
 * Rebuild one customer-safe product projection from its authoritative private
 * product document. Store product mutations call this directly so a successful
 * save cannot leave the customer catalog waiting on an asynchronous trigger.
 * The Firestore trigger remains the safety net for image processors, imports,
 * and administrative writes.
 */
export async function synchronizeProductPublicProfile(
  productId: string,
): Promise<void> {
  const db = getFirestore("default");
  const productSnapshot = await db.collection("products").doc(productId).get();

  if (!productSnapshot.exists) {
    await deletePublicProductProfile(productId);
    return;
  }

  const product = productSnapshot.data() as Data;
  const store = await publicStoreSource(text(product.storeId));

  if (!store || product.isArchived === true || !text(product.taxCategoryId)) {
    await deletePublicProductProfile(productId);
    return;
  }

  await db.collection("productPublicProfiles").doc(productId).set(
    publicProduct(product, productId, store),
  );
}

export const productPublicProfileSync = onDocumentWritten(
  {
    document: "products/{productId}",
    region: "us-central1",
    database: "default",
  },
  async (event) => {
    const after = event.data?.after;

    if (!after?.exists) {
      await deletePublicProductProfile(event.params.productId);
      return;
    }

    await synchronizeProductPublicProfile(event.params.productId);
  },
);

export const productPublicGalleryImageSync = onDocumentWritten(
  {
    document: "products/{productId}/images/{imageId}",
    region: "us-central1",
    database: "default",
  },
  async (event) => {
    const db = getFirestore("default");
    const image = db.collection("productPublicProfiles").doc(event.params.productId).collection("images").doc(event.params.imageId);
    const after = event.data?.after;

    if (!after?.exists || after.data()?.status !== "ready") {
      await image.delete();
      return;
    }

    /* A gallery image cannot be public until its parent product is public. */
    const profile = await db.collection("productPublicProfiles").doc(event.params.productId).get();
    if (!profile.exists) {
      await image.delete();
      return;
    }

    const data = after.data() as Data;
    await image.set({
      id: event.params.imageId,
      altText: text(data.altText),
      position: number(data.position),
      isPrimary: data.isPrimary === true,
      status: "ready",
      imageUrl: text(data.imageUrl),
      imageVariants: data.imageVariants ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    });
  },
);

async function deleteProfilesForStore(storeId: string): Promise<void> {
  const db = getFirestore("default");
  let lastId: string | undefined;

  while (true) {
    let query = db.collection("productPublicProfiles").where("storeId", "==", storeId).orderBy("__name__").limit(100);
    if (lastId) query = query.startAfter(lastId);
    const snapshot = await query.get();
    if (snapshot.empty) return;

    await Promise.all(
      snapshot.docs.map(
        (document) => db.recursiveDelete(document.ref),
      ),
    );
    lastId = snapshot.docs[snapshot.docs.length - 1]?.id;

    if (snapshot.size < 100) return;
  }
}

export async function synchronizeStoreProductPublicProfiles(
  storeId: string,
  store: Data | undefined,
): Promise<void> {
  if (store?.isApproved !== true || store.isActive !== true) {
    await deleteProfilesForStore(storeId);
    return;
  }

  const db = getFirestore("default");
  let lastId: string | undefined;

  while (true) {
    let query = db.collection("products").where("storeId", "==", storeId).orderBy("__name__").limit(150);
    if (lastId) query = query.startAfter(lastId);
    const snapshot = await query.get();
    if (snapshot.empty) return;

    const batch: WriteBatch = db.batch();
    for (const document of snapshot.docs) {
      if (document.data().isArchived === true || !text(document.data().taxCategoryId)) {
        batch.delete(db.collection("productPublicProfiles").doc(document.id));
        continue;
      }
      batch.set(
        db.collection("productPublicProfiles").doc(document.id),
        publicProduct(document.data() as Data, document.id, store),
      );

      /* A store may be activated after its images finished processing. */
      const images = await document.ref.collection("images")
        .where("status", "==", "ready")
        .get();
      images.docs.forEach((image) => {
        const data = image.data() as Data;
        batch.set(
          db.collection("productPublicProfiles").doc(document.id).collection("images").doc(image.id),
          {
            id: image.id,
            altText: text(data.altText),
            position: number(data.position),
            isPrimary: data.isPrimary === true,
            status: "ready",
            imageUrl: text(data.imageUrl),
            imageVariants: data.imageVariants ?? null,
            updatedAt: FieldValue.serverTimestamp(),
          },
        );
      });
    }
    await batch.commit();
    lastId = snapshot.docs[snapshot.docs.length - 1]?.id;

    if (snapshot.size < 150) return;
  }
}

function storeSearchSummaryChanged(
  before: Data | undefined,
  after: Data | undefined,
): boolean {
  const fields = [
    "name",
    "logoUrl",
    "rating",
    "latitude",
    "longitude",
    "address",
    "formattedAddress",
    "phone",
    "isOpen",
    "schedule",
    "isApproved",
    "isActive",
  ];

  return fields.some((field) =>
    JSON.stringify(before?.[field] ?? null) !==
    JSON.stringify(after?.[field] ?? null),
  );
}

/* Publish or remove catalog documents only when marketplace visibility changes. */
export const storeProductPublicVisibilitySync = onDocumentWritten(
  {
    document: "stores/{storeId}",
    region: "us-central1",
    database: "default",
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const beforePublic = before?.isApproved === true && before?.isActive === true;
    const afterPublic = after?.isApproved === true && after?.isActive === true;

    if (afterPublic && (
      !beforePublic ||
      storeSearchSummaryChanged(
        before as Data | undefined,
        after as Data | undefined,
      )
    )) {
      await synchronizeStoreProductPublicProfiles(
        event.params.storeId,
        after as Data,
      );
      return;
    }

    if (beforePublic && !afterPublic) {
      await synchronizeStoreProductPublicProfiles(event.params.storeId, undefined);
    }
  },
);

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

type Data = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function publicProduct(data: Data, productId: string) {
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

async function storeIsPublic(storeId: string): Promise<boolean> {
  if (!storeId) return false;
  const store = await getFirestore("default").collection("stores").doc(storeId).get();
  return store.exists && store.data()?.isApproved === true && store.data()?.isActive === true;
}

async function deletePublicProductProfile(productId: string): Promise<void> {
  await getFirestore("default")
    .recursiveDelete(
      getFirestore("default")
        .collection("productPublicProfiles")
        .doc(productId),
    );
}

export const productPublicProfileSync = onDocumentWritten(
  {
    document: "products/{productId}",
    region: "us-central1",
    database: "default",
  },
  async (event) => {
    const profile = getFirestore("default").collection("productPublicProfiles").doc(event.params.productId);
    const after = event.data?.after;

    if (!after?.exists) {
      await deletePublicProductProfile(event.params.productId);
      return;
    }

    const product = after.data() as Data;
    const storeId = text(product.storeId);

    if (!(await storeIsPublic(storeId))) {
      await deletePublicProductProfile(event.params.productId);
      return;
    }

    await profile.set(publicProduct(product, event.params.productId));
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

async function publishProfilesForStore(storeId: string): Promise<void> {
  const db = getFirestore("default");
  let lastId: string | undefined;

  while (true) {
    let query = db.collection("products").where("storeId", "==", storeId).orderBy("__name__").limit(150);
    if (lastId) query = query.startAfter(lastId);
    const snapshot = await query.get();
    if (snapshot.empty) return;

    const batch: WriteBatch = db.batch();
    for (const document of snapshot.docs) {
      batch.set(
        db.collection("productPublicProfiles").doc(document.id),
        publicProduct(document.data() as Data, document.id),
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

    if (beforePublic === afterPublic) return;

    if (afterPublic) {
      await publishProfilesForStore(event.params.storeId);
      return;
    }

    await deleteProfilesForStore(event.params.storeId);
  },
);

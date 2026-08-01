/*
|--------------------------------------------------------------------------
| Protected Store Product Gallery Callables
|--------------------------------------------------------------------------
|
| The browser uploads bytes only to a verified Storage path. This callable
| reserves the matching Firestore document first, so image metadata and
| processing state cannot be forged or updated directly from the browser.
|
*/

import * as admin from "firebase-admin";
import {
  FieldValue,
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
const allowedExtensions = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif", "avif"]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, maximum = 500): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function identifier(value: unknown, field: string): string {
  const result = text(value, 200);

  if (!result || result.includes("/")) {
    throw new HttpsError("invalid-argument", `A valid ${field} is required.`);
  }

  return result;
}

async function requireOwnedApprovedProduct(uid: string, productId: string) {
  const user = await db.collection("users").doc(uid).get();

  if (user.data()?.accountType !== "store_owner") {
    throw new HttpsError("permission-denied", "Only store owners can manage product images.");
  }

  const storeId = text(user.data()?.storeId, 200);
  const [store, product] = await Promise.all([
    storeId ? db.collection("stores").doc(storeId).get() : Promise.resolve(null),
    db.collection("products").doc(productId).get(),
  ]);

  if (
    !store?.exists ||
    store.data()?.ownerId !== uid ||
    store.data()?.isApproved !== true ||
    store.data()?.onboardingCompleted !== true ||
    !product.exists ||
    product.data()?.storeId !== store.id
  ) {
    throw new HttpsError("permission-denied", "You cannot manage images for this product.");
  }

  return { storeId: store.id, product };
}

export const prepareStoreProductGalleryImage = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in to upload a product image.");
  }

  const input = record(request.data);
  const productId = identifier(input.productId, "product ID");
  const imageId = identifier(input.imageId, "image ID");
  const role = text(input.role, 20);
  const position = input.position;
  const extension = text(input.extension, 10).toLowerCase();
  const altText = text(input.altText, 300);

  if ((role !== "front" && role !== "back") || (position !== 0 && position !== 1)) {
    throw new HttpsError("invalid-argument", "A product image must be a front or back image in a valid position.");
  }

  if (!allowedExtensions.has(extension)) {
    throw new HttpsError("invalid-argument", "This image format is not supported.");
  }

  const { storeId } = await requireOwnedApprovedProduct(request.auth.uid, productId);
  const originalImagePath = `stores/${storeId}/products/${productId}/gallery/${imageId}/original.${extension}`;
  const imageReference = db.collection("products").doc(productId).collection("images").doc(imageId);

  await imageReference.set({
    id: imageId,
    productId,
    storeId,
    role,
    altText,
    position,
    isPrimary: role === "front",
    status: "uploading",
    imageUrl: "",
    imageVariants: null,
    originalImagePath,
    optimizedImagePath: null,
    imageError: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    originalImagePath,
    metadata: {
      productId,
      storeId,
      imageId,
      galleryImageId: imageId,
      role,
      position: String(position),
      altText,
      processingType: "product-gallery-image-original",
    },
  };
});

export const failStoreProductGalleryImageUpload = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in to update a product image.");
  }

  const input = record(request.data);
  const productId = identifier(input.productId, "product ID");
  const imageId = identifier(input.imageId, "image ID");
  const error = text(input.error, 500) || "Gallery image upload failed.";
  const { storeId } = await requireOwnedApprovedProduct(request.auth.uid, productId);
  const reference = db.collection("products").doc(productId).collection("images").doc(imageId);
  const image = await reference.get();

  if (!image.exists || image.data()?.storeId !== storeId) {
    throw new HttpsError("not-found", "The product image could not be found.");
  }

  await reference.update({
    status: "failed",
    imageError: error,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { success: true };
});

export const getOwnedStoreProductImages = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in to view product images.");
  }

  const productId = identifier(record(request.data).productId, "product ID");
  await requireOwnedApprovedProduct(request.auth.uid, productId);
  const images = await db.collection("products").doc(productId).collection("images").get();

  return {
    images: images.docs.map((image) => {
      const data = image.data();
      return {
        id: image.id,
        altText: text(data.altText, 300),
        position: typeof data.position === "number" ? data.position : 0,
        isPrimary: data.isPrimary === true,
        status: text(data.status, 30) || "none",
        imageUrl: text(data.imageUrl, 2_000),
        imageVariants: data.imageVariants ?? undefined,
        originalImagePath: typeof data.originalImagePath === "string" ? data.originalImagePath : null,
        optimizedImagePath: typeof data.optimizedImagePath === "string" ? data.optimizedImagePath : null,
        imageError: typeof data.imageError === "string" ? data.imageError : null,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? "",
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? "",
      };
    }),
  };
});

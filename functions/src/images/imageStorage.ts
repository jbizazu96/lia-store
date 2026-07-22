/*
|--------------------------------------------------------------------------
| Image Storage Helpers
|--------------------------------------------------------------------------
|
| Handles Cloud Storage operations for product-image processing.
|
| Responsibilities:
|
| - Download the original upload.
| - Upload the optimized WebP.
| - Apply long-lived immutable caching.
| - Generate a customer-facing download URL.
| - Delete the original after successful processing.
|
| This file contains no Sharp or Firestore logic.
|
*/

import {
  getStorage,
} from "firebase-admin/storage";

import {
  randomUUID,
} from "crypto";

import {
  PRODUCT_IMAGE_CONFIG,
} from "./imageTypes";

/*
|--------------------------------------------------------------------------
| Download Original Image
|--------------------------------------------------------------------------
*/

export async function downloadOriginalImage(
  bucketName: string,
  originalImagePath: string
): Promise<Buffer> {
  if (!bucketName.trim()) {
    throw new Error(
      "A Storage bucket name is required."
    );
  }

  if (!originalImagePath.trim()) {
    throw new Error(
      "An original image path is required."
    );
  }

  const bucket =
    getStorage().bucket(
      bucketName
    );

  const file =
    bucket.file(
      originalImagePath
    );

  const [
    exists,
  ] = await file.exists();

  if (!exists) {
    throw new Error(
      `Original image not found: ${originalImagePath}`
    );
  }

  const [
    buffer,
  ] = await file.download();

  if (
    !buffer ||
    buffer.length === 0
  ) {
    throw new Error(
      "The downloaded original image is empty."
    );
  }

  return buffer;
}

/*
|--------------------------------------------------------------------------
| Build Optimized Image Path
|--------------------------------------------------------------------------
*/

export function buildOptimizedImagePath(
  storeId: string,
  productId: string,
  imageId: string
): string {
  if (
    !storeId.trim() ||
    !productId.trim() ||
    !imageId.trim()
  ) {
    throw new Error(
      "Store ID, product ID, and image ID are required."
    );
  }

  return (
    `stores/${storeId}` +
    `/products/${productId}` +
    `/optimized/${imageId}.webp`
  );
}

/*
|--------------------------------------------------------------------------
| Upload Optimized WebP
|--------------------------------------------------------------------------
*/

interface UploadOptimizedImageParams {
  bucketName: string;

  optimizedImagePath: string;

  buffer: Buffer;

  productId: string;

  storeId: string;

  imageId: string;
}

interface UploadOptimizedImageResult {
  optimizedImageUrl: string;

  downloadToken: string;
}

export async function uploadOptimizedImage({
  bucketName,
  optimizedImagePath,
  buffer,
  productId,
  storeId,
  imageId,
}: UploadOptimizedImageParams):
Promise<UploadOptimizedImageResult> {
  if (!bucketName.trim()) {
    throw new Error(
      "A Storage bucket name is required."
    );
  }

  if (!optimizedImagePath.trim()) {
    throw new Error(
      "An optimized image path is required."
    );
  }

  if (
    !buffer ||
    buffer.length === 0
  ) {
    throw new Error(
      "The optimized image buffer is empty."
    );
  }

  const bucket =
    getStorage().bucket(
      bucketName
    );

  const optimizedFile =
    bucket.file(
      optimizedImagePath
    );

  /*
  |--------------------------------------------------------------------------
  | Firebase Download Token
  |--------------------------------------------------------------------------
  |
  | Firebase Storage download URLs use this token.
  |
  | A new token is generated for every unique optimized image.
  |
  */

  const downloadToken =
    randomUUID();

  await optimizedFile.save(
    buffer,
    {
      resumable: false,

      validation:
        "crc32c",

      metadata: {
        contentType:
          "image/webp",

        cacheControl:
          PRODUCT_IMAGE_CONFIG
            .CACHE_CONTROL,

        metadata: {
          firebaseStorageDownloadTokens:
            downloadToken,

          productId,

          storeId,

          imageId,

          processingType:
            "product-image-optimized",
        },
      },
    }
  );

  const encodedPath =
    encodeURIComponent(
      optimizedImagePath
    );

  const optimizedImageUrl =
    `https://firebasestorage.googleapis.com/v0/b/` +
    `${bucketName}/o/${encodedPath}` +
    `?alt=media&token=${downloadToken}`;

  return {
    optimizedImageUrl,
    downloadToken,
  };
}

/*
|--------------------------------------------------------------------------
| Delete Original Image
|--------------------------------------------------------------------------
*/

export async function deleteOriginalImage(
  bucketName: string,
  originalImagePath: string
): Promise<void> {
  if (
    !bucketName.trim() ||
    !originalImagePath.trim()
  ) {
    return;
  }

  const bucket =
    getStorage().bucket(
      bucketName
    );

  const originalFile =
    bucket.file(
      originalImagePath
    );

  const [
    exists,
  ] = await originalFile.exists();

  if (!exists) {
    return;
  }

  await originalFile.delete();
}

/*
|--------------------------------------------------------------------------
| Delete Optimized Image
|--------------------------------------------------------------------------
|
| An optimized image is immutable and has a unique path. Once a replacement
| is safely referenced by Firestore, its previous path can be removed.
|
*/

export async function deleteOptimizedImage(
  bucketName: string,
  optimizedImagePath: string
): Promise<void> {
  if (
    !bucketName.trim() ||
    !optimizedImagePath.trim()
  ) {
    return;
  }

  const file = getStorage()
    .bucket(bucketName)
    .file(optimizedImagePath);

  const [exists] = await file.exists();

  if (exists) {
    await file.delete();
  }
}

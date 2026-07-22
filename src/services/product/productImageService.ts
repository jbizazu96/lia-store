/*
|--------------------------------------------------------------------------
| Product Image Service
|--------------------------------------------------------------------------
|
| Uploads original product images to Firebase Storage.
|
| Important:
|
| This service does NOT:
|
| - Resize images.
| - Convert images to WebP.
| - Generate optimized URLs.
| - Delete original images.
|
| Those responsibilities belong to the background Firebase Function.
|
| The browser waits only until the original file reaches Firebase Storage.
| After that, the Storage-triggered Function continues processing
| independently.
|
*/

import {
  getStorage,
  ref,
  uploadBytesResumable,
  type UploadMetadata,
} from "firebase/storage";

import {
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import {
  db,
} from "@/lib/firebase";

/*
|--------------------------------------------------------------------------
| Supported Image Types
|--------------------------------------------------------------------------
*/

const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

const IMAGE_TYPE_BY_EXTENSION: Record<string, (typeof SUPPORTED_IMAGE_TYPES)[number]> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

/*
|--------------------------------------------------------------------------
| Maximum Original Upload Size
|--------------------------------------------------------------------------
|
| Large originals waste bandwidth and increase Function processing time.
|
| 10 MB is generous enough for modern phone photos while still preventing
| extremely large uploads.
|
*/

const MAX_IMAGE_SIZE_BYTES =
  10 * 1024 * 1024;

/*
|--------------------------------------------------------------------------
| Upload Parameters
|--------------------------------------------------------------------------
*/

interface UploadProductImageParams {
  /*
   * Product document that will receive the optimized image.
   */
  productId: string;

  /*
   * Store that owns the product.
   */
  storeId: string;

  /*
   * Original image selected by the store owner.
   */
  file: File;

  /*
   * Optional upload progress callback.
   *
   * Value ranges from 0 through 100.
   */
  onProgress?: (
    progress: number
  ) => void;
}

/*
|--------------------------------------------------------------------------
| Upload Result
|--------------------------------------------------------------------------
*/

interface UploadProductImageResult {
  /*
   * Firebase Storage path of the original image.
   */
  originalImagePath: string;

  /*
   * Unique image identifier.
   *
   * The Firebase Function can use this to create the optimized filename.
   */
  imageId: string;
}

/*
|--------------------------------------------------------------------------
| Validate Image
|--------------------------------------------------------------------------
*/

export function validateProductImageFile(
  file: File
): (typeof SUPPORTED_IMAGE_TYPES)[number] {
  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase();

  const contentType =
    SUPPORTED_IMAGE_TYPES.includes(
      file.type as
        (typeof SUPPORTED_IMAGE_TYPES)[number]
    )
      ? file.type as (typeof SUPPORTED_IMAGE_TYPES)[number]
      : extension
        ? IMAGE_TYPE_BY_EXTENSION[extension]
        : undefined;

  if (!contentType) {
    throw new Error(
      "Please upload a JPG, PNG, WebP, or HEIC image."
    );
  }

  if (
    file.size >
    MAX_IMAGE_SIZE_BYTES
  ) {
    throw new Error(
      "The image must be 10 MB or smaller."
    );
  }

  if (file.size <= 0) {
    throw new Error(
      "The selected image is empty."
    );
  }

  return contentType;
}

/*
|--------------------------------------------------------------------------
| Create Unique Image ID
|--------------------------------------------------------------------------
|
| Unique filenames allow optimized images to use:
|
| Cache-Control: public, max-age=31536000, immutable
|
| When an image changes, a new filename is generated, so browsers never
| receive a stale cached image.
|
*/

function createImageId(): string {
  return `${Date.now()}-${crypto.randomUUID()}`;
}

/*
|--------------------------------------------------------------------------
| Product Image Service
|--------------------------------------------------------------------------
*/

export const productImageService = {
  /*
  |--------------------------------------------------------------------------
  | Upload Original Product Image
  |--------------------------------------------------------------------------
  |
  | Flow:
  |
  | 1. Validate the selected image.
  | 2. Mark the product as uploading.
  | 3. Upload the original file to Firebase Storage.
  | 4. Mark the product as processing.
  | 5. Return immediately after the original upload finishes.
  |
  | A Storage-triggered Firebase Function will then:
  |
  | - Download the original.
  | - Resize it.
  | - Convert it to WebP.
  | - Upload the optimized version.
  | - Update the product document.
  |
  */

  async uploadOriginalImage({
    productId,
    storeId,
    file,
    onProgress,
  }: UploadProductImageParams):
  Promise<UploadProductImageResult> {
    if (!productId.trim()) {
      throw new Error(
        "A product ID is required."
      );
    }

    if (!storeId.trim()) {
      throw new Error(
        "A store ID is required."
      );
    }

    const contentType =
      validateProductImageFile(file);

    const storage =
      getStorage();

    const imageId =
      createImageId();

    /*
    |--------------------------------------------------------------------------
    | Original Storage Path
    |--------------------------------------------------------------------------
    |
    | Example:
    |
    | stores/store123/products/product456/originals/1720000000-uuid.jpg
    |
    */

    const extension =
      file.name
        .split(".")
        .pop()
        ?.toLowerCase() ||
      "image";

    const originalImagePath =
      `stores/${storeId}/products/${productId}/originals/${imageId}.${extension}`;

    /*
    |--------------------------------------------------------------------------
    | Update Product Before Upload
    |--------------------------------------------------------------------------
    */

    await updateDoc(
      doc(
        db,
        "products",
        productId
      ),
      {
        imageStatus:
          "uploading",

        originalImagePath,

        optimizedImagePath:
          null,

        imageError:
          null,

        updatedAt:
          serverTimestamp(),
      }
    );

    /*
    |--------------------------------------------------------------------------
    | Storage Metadata
    |--------------------------------------------------------------------------
    |
    | customMetadata allows the background Function to identify exactly
    | which store and product belong to this upload.
    |
    | The original is not intended for long-term customer delivery, so it
    | receives a short/private cache policy.
    |
    */

    const metadata:
    UploadMetadata = {
      contentType:
        contentType,

      cacheControl:
        "private, max-age=0, no-cache",

      customMetadata: {
        productId,
        storeId,
        imageId,
        processingType:
          "product-image-original",
      },
    };

    const storageReference =
      ref(
        storage,
        originalImagePath
      );

    /*
    |--------------------------------------------------------------------------
    | Resumable Upload
    |--------------------------------------------------------------------------
    */

    const uploadTask =
      uploadBytesResumable(
        storageReference,
        file,
        metadata
      );

    try {
      await new Promise<void>(
        (
          resolve,
          reject
        ) => {
          uploadTask.on(
            "state_changed",

            /*
            |--------------------------------------------------------------------------
            | Progress
            |--------------------------------------------------------------------------
            */

            (snapshot) => {
              if (
                snapshot.totalBytes <=
                0
              ) {
                return;
              }

              const progress =
                Math.round(
                  (
                    snapshot.bytesTransferred /
                    snapshot.totalBytes
                  ) * 100
                );

              onProgress?.(
                progress
              );
            },

            /*
            |--------------------------------------------------------------------------
            | Upload Error
            |--------------------------------------------------------------------------
            */

            reject,

            /*
            |--------------------------------------------------------------------------
            | Original Upload Complete
            |--------------------------------------------------------------------------
            */

            resolve
          );
        }
      );

      /*
      |--------------------------------------------------------------------------
      | Hand Off To Background Function
      |--------------------------------------------------------------------------
      |
      | At this point the browser's responsibility is complete.
      |
      | The Firebase Storage trigger will continue the expensive image work.
      |
      */

      await updateDoc(
        doc(
          db,
          "products",
          productId
        ),
        {
          imageStatus:
            "processing",

          originalImagePath,

          imageError:
            null,

          updatedAt:
            serverTimestamp(),
        }
      );

      return {
        originalImagePath,
        imageId,
      };
    } catch (uploadError) {
      console.error(
        "Product image upload failed:",
        uploadError
      );

      /*
       * Record the failure so the store dashboard can show a retry state.
       */

      try {
        await updateDoc(
          doc(
            db,
            "products",
            productId
          ),
          {
            imageStatus:
              "failed",

            imageError:
              uploadError instanceof
              Error
                ? uploadError.message
                : "Image upload failed.",

            updatedAt:
              serverTimestamp(),
          }
        );
      } catch (
        statusUpdateError
      ) {
        console.error(
          "Failed to update image failure status:",
          statusUpdateError
        );
      }

      throw uploadError;
    }
  },
};

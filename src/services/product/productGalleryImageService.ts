/*
|--------------------------------------------------------------------------
| Product Gallery Image Service
|--------------------------------------------------------------------------
|
| Uploads original front and back product images to Firebase Storage.
|
| Each gallery image has:
|
| - Its own Firestore document
| - Its own Storage path
| - Its own processing status
| - Its own independent Firebase Function workflow
|
| Firestore path:
|
| products/{productId}/images/{imageId}
|
| Storage path:
|
| stores/{storeId}/products/{productId}/gallery/{imageId}/original.ext
|
| This service does not resize, enhance, or convert images.
| Firebase Functions will perform those operations later.
|
*/

import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import {
  getFunctions,
  httpsCallable,
} from "firebase/functions";

import {
  getStorage,
  ref,
  uploadBytesResumable,
  type UploadMetadata,
} from "firebase/storage";

import {
  db,
} from "@/lib/firebase";

import type {
  ProductImageRole,
} from "@/types/productForm";

import {
  validateProductImageFile,
} from "@/services/product/productImageService";

/*
|--------------------------------------------------------------------------
| Upload Parameters
|--------------------------------------------------------------------------
*/

interface UploadGalleryImageParams {
  /**
   * Product receiving this gallery image.
   */
  productId: string;

  /**
   * Store that owns the product.
   */
  storeId: string;

  /**
   * Stable image ID created by the form submission.
   */
  imageId: string;

  /**
   * Front or back image.
   */
  role: ProductImageRole;

  /**
   * Original browser file.
   */
  file: File;

  /**
   * Accessibility description.
   */
  altText: string;

  /**
   * Gallery ordering position.
   *
   * Front = 0
   * Back = 1
   */
  position: number;

  /**
   * Optional browser upload progress callback.
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

interface UploadGalleryImageResult {
  imageId: string;

  role: ProductImageRole;

  originalImagePath: string;
}

/*
|--------------------------------------------------------------------------
| Delete Parameters
|--------------------------------------------------------------------------
*/

interface DeleteGalleryImageParams {
  productId: string;

  galleryImageId: string;
}

/*
|--------------------------------------------------------------------------
| Build Original Extension
|--------------------------------------------------------------------------
*/

function getFileExtension(
  file: File
): string {
  const extension =
    file.name
      .split(".")
      .pop()
      ?.trim()
      .toLowerCase();

  return extension || "image";
}

/*
|--------------------------------------------------------------------------
| Product Gallery Image Service
|--------------------------------------------------------------------------
*/

export const productGalleryImageService = {
  /*
  |--------------------------------------------------------------------------
  | Upload Gallery Image
  |--------------------------------------------------------------------------
  |
  | Workflow:
  |
  | 1. Validate identifiers and file.
  | 2. Create the gallery-image Firestore document.
  | 3. Upload the original image to Storage.
  | 4. Mark the gallery image as processing.
  | 5. Return after the browser upload completes.
  |
  | The Firebase Storage trigger will later:
  |
  | - Send the image through Claid
  | - Generate four Sharp variants
  | - Update this gallery-image document
  | - Mirror the front image onto the parent product document
  |
  */

  async uploadGalleryImage({
    productId,
    storeId,
    imageId,
    role,
    file,
    altText,
    position,
    onProgress,
  }: UploadGalleryImageParams):
  Promise<UploadGalleryImageResult> {
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

    if (!imageId.trim()) {
      throw new Error(
        "A gallery image ID is required."
      );
    }

    if (
      role !== "front" &&
      role !== "back"
    ) {
      throw new Error(
        "The gallery image role must be front or back."
      );
    }

    if (
      position !== 0 &&
      position !== 1
    ) {
      throw new Error(
        "The gallery image position must be 0 or 1."
      );
    }

    const contentType =
      validateProductImageFile(
        file
      );

    const extension =
      getFileExtension(
        file
      );

    const originalImagePath =
      `stores/${storeId}` +
      `/products/${productId}` +
      `/gallery/${imageId}` +
      `/original.${extension}`;

    /*
    |--------------------------------------------------------------------------
    | Gallery Image Document
    |--------------------------------------------------------------------------
    */

    const galleryImageReference =
      doc(
        collection(
          db,
          "products",
          productId,
          "images"
        ),
        imageId
      );

    await setDoc(
      galleryImageReference,
      {
        id:
          imageId,

        productId,

        storeId,

        role,

        altText:
          altText.trim(),

        position,

        isPrimary:
          role === "front",

        status:
          "uploading",

        imageUrl:
          "",

        imageVariants:
          null,

        originalImagePath,

        optimizedImagePath:
          null,

        imageError:
          null,

        createdAt:
          serverTimestamp(),

        updatedAt:
          serverTimestamp(),
      }
    );

    /*
    |--------------------------------------------------------------------------
    | Storage Metadata
    |--------------------------------------------------------------------------
    |
    | The Firebase Function uses this metadata to distinguish gallery uploads
    | from the legacy single-image workflow.
    |
    */

    const metadata:
    UploadMetadata = {
      contentType,

      cacheControl:
        "private, max-age=0, no-cache",

      customMetadata: {
        productId,

        storeId,

        imageId,

        galleryImageId:
          imageId,

        role,

        position:
          position.toString(),

        altText:
          altText.trim(),

        processingType:
          "product-gallery-image-original",
      },
    };

    const storageReference =
      ref(
        getStorage(),
        originalImagePath
      );

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

            reject,

            resolve
          );
        }
      );

      /*
      |--------------------------------------------------------------------------
      | Hand Off To Firebase Functions
      |--------------------------------------------------------------------------
      */

      await updateDoc(
        galleryImageReference,
        {
          status:
            "processing",

          imageError:
            null,

          updatedAt:
            serverTimestamp(),
        }
      );

      return {
        imageId,

        role,

        originalImagePath,
      };
    } catch (uploadError) {
      console.error(
        "Product gallery image upload failed:",
        uploadError
      );

      try {
        await updateDoc(
          galleryImageReference,
          {
            status:
              "failed",

            imageError:
              uploadError instanceof Error
                ? uploadError.message
                : "Gallery image upload failed.",

            updatedAt:
              serverTimestamp(),
          }
        );
      } catch (
        statusUpdateError
      ) {
        console.error(
          "Failed to record gallery image upload failure:",
          statusUpdateError
        );
      }

      throw uploadError;
    }
  },

  /*
|--------------------------------------------------------------------------
| Delete Gallery Image
|--------------------------------------------------------------------------
|
| Calls the secure Firebase Callable Function.
|
| The Function:
|
| - Verifies store ownership
| - Deletes every Storage file for the selected image
| - Deletes the gallery Firestore document
| - Clears parent product image fields when removing the front image
|
*/

async deleteGalleryImage({
  productId,
  galleryImageId,
}: DeleteGalleryImageParams):
Promise<void> {
  if (!productId.trim()) {
    throw new Error(
      "A product ID is required."
    );
  }

  if (!galleryImageId.trim()) {
    throw new Error(
      "A gallery image ID is required."
    );
  }

  const callable =
    httpsCallable<
      DeleteGalleryImageParams,
      {
        success: boolean;
      }
    >(
      getFunctions(),
      "deleteProductGalleryImage"
    );

  await callable({
    productId,
    galleryImageId,
  });
},

};
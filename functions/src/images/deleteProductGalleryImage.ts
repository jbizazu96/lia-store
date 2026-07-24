/*
|--------------------------------------------------------------------------
| Delete Product Gallery Image
|--------------------------------------------------------------------------
|
| Callable Function used when a store owner removes only one product image.
|
| Responsibilities:
|
| - Require authentication.
| - Verify the caller owns the product's store.
| - Delete every Storage object under this gallery image folder.
| - Delete the gallery image Firestore document.
| - Clear parent product image fields when the removed image is the front image.
|
| This does not delete the product itself.
|
*/

import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

import {
  getStorage,
} from "firebase-admin/storage";

import {
  logger,
} from "firebase-functions";

import {
  PRODUCT_IMAGE_CONFIG,
} from "./imageTypes";

/*
|--------------------------------------------------------------------------
| Request Data
|--------------------------------------------------------------------------
*/

interface DeleteProductGalleryImageData {
  productId?: unknown;

  galleryImageId?: unknown;
}

/*
|--------------------------------------------------------------------------
| Callable Function
|--------------------------------------------------------------------------
*/

export const deleteProductGalleryImage =
  onCall<DeleteProductGalleryImageData>(
    {
      region:
        PRODUCT_IMAGE_CONFIG
          .REGION,
    },

    async (request) => {
      /*
      |--------------------------------------------------------------------------
      | Authentication
      |--------------------------------------------------------------------------
      */

      const userId =
        request.auth?.uid;

      if (!userId) {
        throw new HttpsError(
          "unauthenticated",
          "You must be signed in to remove a product image."
        );
      }

      const productId =
        typeof request.data.productId ===
          "string"
          ? request.data.productId.trim()
          : "";

      const galleryImageId =
        typeof request.data.galleryImageId ===
          "string"
          ? request.data.galleryImageId.trim()
          : "";

      if (
        !productId ||
        !galleryImageId
      ) {
        throw new HttpsError(
          "invalid-argument",
          "A product ID and gallery image ID are required."
        );
      }

      const firestore =
        getFirestore("default");

      const productReference =
        firestore
          .collection("products")
          .doc(productId);

      const galleryImageReference =
        productReference
          .collection("images")
          .doc(galleryImageId);

      /*
      |--------------------------------------------------------------------------
      | Load Product And Gallery Image
      |--------------------------------------------------------------------------
      */

      const [
        productSnapshot,
        galleryImageSnapshot,
      ] =
        await Promise.all([
          productReference.get(),

          galleryImageReference.get(),
        ]);

      if (!productSnapshot.exists) {
        throw new HttpsError(
          "not-found",
          "The product could not be found."
        );
      }

      if (!galleryImageSnapshot.exists) {
        throw new HttpsError(
          "not-found",
          "The product image could not be found."
        );
      }

      const productData =
        productSnapshot.data();

      const galleryImageData =
        galleryImageSnapshot.data();

      const storeId =
        typeof productData?.storeId ===
          "string"
          ? productData.storeId
          : "";

      if (!storeId) {
        throw new HttpsError(
          "failed-precondition",
          "The product does not have a valid store."
        );
      }

      /*
      |--------------------------------------------------------------------------
      | Verify Store Ownership
      |--------------------------------------------------------------------------
      */

      const storeSnapshot =
        await firestore
          .collection("stores")
          .doc(storeId)
          .get();

      const ownerId =
        storeSnapshot.data()?.ownerId;

      if (
        !storeSnapshot.exists ||
        ownerId !== userId
      ) {
        throw new HttpsError(
          "permission-denied",
          "You do not have permission to remove this product image."
        );
      }

      /*
      |--------------------------------------------------------------------------
      | Validate Gallery Image Ownership
      |--------------------------------------------------------------------------
      */

      if (
        galleryImageData?.productId !==
          productId ||
        galleryImageData?.storeId !==
          storeId
      ) {
        throw new HttpsError(
          "failed-precondition",
          "The gallery image does not belong to this product."
        );
      }

      const role =
        galleryImageData?.role;

      if (
        role !== "front" &&
        role !== "back"
      ) {
        throw new HttpsError(
          "failed-precondition",
          "The gallery image has an invalid role."
        );
      }

      /*
      |--------------------------------------------------------------------------
      | Delete Storage Folder
      |--------------------------------------------------------------------------
      |
      | Gallery image path:
      |
      | stores/{storeId}/products/{productId}/gallery/{galleryImageId}/
      |
      | This removes:
      |
      | - Remaining original
      | - thumbnail
      | - small
      | - medium
      | - large
      |
      */

      const prefix =
        `stores/${storeId}` +
        `/products/${productId}` +
        `/gallery/${galleryImageId}/`;

      const bucket =
        getStorage().bucket();

      try {
        const [
          files,
        ] =
          await bucket.getFiles({
            prefix,
          });

        const deletionResults =
          await Promise.allSettled(
            files.map(
              (file) =>
                file.delete({
                  ignoreNotFound:
                    true,
                })
            )
          );

        const failedDeletions =
          deletionResults.filter(
            (result) =>
              result.status ===
              "rejected"
          );

        if (
          failedDeletions.length >
          0
        ) {
          throw new Error(
            `Failed to delete ${failedDeletions.length} gallery image file(s).`
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Delete Firestore Data
        |--------------------------------------------------------------------------
        */

        await firestore.runTransaction(
          async (transaction) => {
            const currentProductSnapshot =
              await transaction.get(
                productReference
              );

            const currentImageSnapshot =
              await transaction.get(
                galleryImageReference
              );

            if (
              !currentProductSnapshot.exists ||
              !currentImageSnapshot.exists
            ) {
              return;
            }

            transaction.delete(
              galleryImageReference
            );

            /*
             * When the front image is removed, clear the parent product image
             * fields because customer cards must never keep showing a deleted
             * image.
             */

            if (role === "front") {
              transaction.update(
                productReference,
                {
                  imageUrl:
                    "",

                  imageVariants:
                    FieldValue.delete(),

                  imageStatus:
                    "none",

                  primaryImageId:
                    null,

                  originalImagePath:
                    FieldValue.delete(),

                  optimizedImagePath:
                    FieldValue.delete(),

                  imageError:
                    null,

                  imageProcessedAt:
                    FieldValue.delete(),

                  imageWidth:
                    FieldValue.delete(),

                  imageHeight:
                    FieldValue.delete(),

                  imageSizeBytes:
                    FieldValue.delete(),

                  imageFormat:
                    FieldValue.delete(),

                  updatedAt:
                    FieldValue.serverTimestamp(),
                }
              );
            } else {
              transaction.update(
                productReference,
                {
                  updatedAt:
                    FieldValue.serverTimestamp(),
                }
              );
            }
          }
        );

        logger.info(
          "Product gallery image deleted successfully.",
          {
            productId,

            galleryImageId,

            storeId,

            role,

            deletedFileCount:
              files.length,
          }
        );

        return {
          success:
            true,

          productId,

          galleryImageId,

          role,
        };
      } catch (deletionError) {
        logger.error(
          "Failed to delete product gallery image.",
          {
            productId,

            galleryImageId,

            storeId,

            role,

            prefix,

            deletionError,
          }
        );

        throw new HttpsError(
          "internal",
          "The product image could not be removed."
        );
      }
    }
  );
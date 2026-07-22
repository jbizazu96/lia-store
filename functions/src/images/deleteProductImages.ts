/*
|--------------------------------------------------------------------------
| Delete Product Images Trigger
|--------------------------------------------------------------------------
|
| Runs when a product document is deleted.
|
| Responsibilities:
|
| - Read the deleted product's store ID.
| - Delete every Storage object under the product's image folder.
| - Prevent orphaned originals and optimized WebP files.
|
*/

import {
  onDocumentDeleted,
} from "firebase-functions/v2/firestore";

import {
  logger,
} from "firebase-functions";

import {
  getStorage,
} from "firebase-admin/storage";

import {
  PRODUCT_IMAGE_CONFIG,
} from "./imageTypes";

/*
|--------------------------------------------------------------------------
| Trigger
|--------------------------------------------------------------------------
*/

export const deleteProductImages =
  onDocumentDeleted(
    {
      document:
        "products/{productId}",

      database:
        "default",

      region:
        PRODUCT_IMAGE_CONFIG.REGION,
    },

    async (event) => {
      const productId =
        event.params.productId;

      const deletedProduct =
        event.data?.data();

      if (!productId) {
        logger.warn(
          "Product deletion event did not include a product ID."
        );

        return;
      }

      const storeId =
        deletedProduct?.storeId;

      if (
        typeof storeId !== "string" ||
        !storeId.trim()
      ) {
        logger.warn(
          "Deleted product did not contain a valid store ID.",
          {
            productId,
          }
        );

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | Product Image Folder
      |--------------------------------------------------------------------------
      |
      | Deletes both:
      |
      | - originals/
      | - optimized/
      |
      | Example:
      |
      | stores/store123/products/product456/
      |
      */

      const prefix =
        `stores/${storeId}` +
        `/products/${productId}/`;

      const bucket =
        getStorage().bucket();

      try {
        const [
          files,
        ] = await bucket.getFiles({
          prefix,
        });

        if (files.length === 0) {
          logger.info(
            "No product images found during product deletion.",
            {
              productId,
              storeId,
              prefix,
            }
          );

          return;
        }

        /*
        |--------------------------------------------------------------------------
        | Delete Product Files
        |--------------------------------------------------------------------------
        |
        | Promise.allSettled prevents one missing or already-deleted file from
        | stopping cleanup of the remaining files.
        |
        */

        const deletionResults =
          await Promise.allSettled(
            files.map(
              (file) =>
                file.delete({
                  ignoreNotFound: true,
                })
            )
          );

        const deletedCount =
          deletionResults.filter(
            (result) =>
              result.status ===
              "fulfilled"
          ).length;

        const failedResults =
          deletionResults.filter(
            (result) =>
              result.status ===
              "rejected"
          );

        if (
          failedResults.length > 0
        ) {
          logger.warn(
            "Some product image files could not be deleted.",
            {
              productId,
              storeId,
              prefix,
              deletedCount,
              failedCount:
                failedResults.length,
            }
          );

          /*
           * Throwing causes the invocation to be recorded as failed and allows
           * retry behavior if retries are enabled later.
           */

          throw new Error(
            `Failed to delete ${failedResults.length} product image file(s).`
          );
        }

        logger.info(
          "Product images deleted successfully.",
          {
            productId,
            storeId,
            prefix,
            deletedCount,
          }
        );
      } catch (cleanupError) {
        logger.error(
          "Product image cleanup failed after product deletion.",
          {
            productId,
            storeId,
            prefix,
            cleanupError,
          }
        );

        throw cleanupError;
      }
    }
  );
/*
|--------------------------------------------------------------------------
| Process Product Image Trigger
|--------------------------------------------------------------------------
|
| Runs automatically whenever an original product image is uploaded.
|
| Workflow:
|
| 1. Validate the uploaded object.
| 2. Read product/store/image metadata.
| 3. Mark the product image as processing.
| 4. Download the original.
| 5. Resize and convert it to WebP with Sharp.
| 6. Upload the optimized image with long-lived caching.
| 7. Update the product document.
| 8. Delete the original upload.
| 9. Record any processing failure.
|
*/

import {
  onObjectFinalized,
} from "firebase-functions/v2/storage";

import {
  logger,
} from "firebase-functions";

import {
  PRODUCT_IMAGE_CONFIG,
} from "./imageTypes";

import {
  processProductImage as optimizeProductImage,
} from "./imageProcessor";

import {
  buildOptimizedImagePath,
  deleteOptimizedImage,
  deleteOriginalImage,
  downloadOriginalImage,
  uploadOptimizedImage,
} from "./imageStorage";

import {
  markProductImageFailed,
  markProductImageProcessing,
  markProductImageReady,
} from "./imageFirestore";

import type {
  ProductImageMetadata,
  ProductImageProcessingResult,
} from "./imageTypes";

/*
|--------------------------------------------------------------------------
| Metadata Validation
|--------------------------------------------------------------------------
*/

function getProductImageMetadata(
  metadata:
    | Record<string, string>
    | undefined
): ProductImageMetadata | null {
  if (!metadata) {
    return null;
  }

  const {
    productId,
    storeId,
    imageId,
    processingType,
  } = metadata;

  if (
    !productId ||
    !storeId ||
    !imageId ||
    processingType !==
      PRODUCT_IMAGE_CONFIG.PROCESSING_TYPE
  ) {
    return null;
  }

  return {
    productId,
    storeId,
    imageId,
    processingType,
  };
}

/*
|--------------------------------------------------------------------------
| Trigger
|--------------------------------------------------------------------------
*/

export const processProductImage =
  onObjectFinalized(
    {
      region:
        PRODUCT_IMAGE_CONFIG.REGION,

      /*
       * Sharp benefits from additional memory when processing larger
       * phone-camera images.
       */

      memory:
        "1GiB",

      timeoutSeconds:
        120,
    },

    async (event) => {
      const object =
        event.data;

      const bucketName =
        object.bucket;

      const originalImagePath =
        object.name;

      /*
      |--------------------------------------------------------------------------
      | Ignore Invalid Objects
      |--------------------------------------------------------------------------
      */

      if (
        !bucketName ||
        !originalImagePath
      ) {
        logger.warn(
          "Ignoring Storage event without bucket or object path."
        );

        return;
      }

      /*
       * Ignore optimized images so the Function does not trigger itself
       * repeatedly.
       */

      if (
        originalImagePath.includes(
          "/optimized/"
        )
      ) {
        return;
      }

      /*
       * Only process supported image content types.
       */

      if (
        !object.contentType?.startsWith(
          "image/"
        )
      ) {
        logger.info(
          "Ignoring non-image upload.",
          {
            originalImagePath,
            contentType:
              object.contentType,
          }
        );

        return;
      }

      const metadata =
        getProductImageMetadata(
          object.metadata
        );

      /*
       * Ignore unrelated Storage uploads such as store banners, profile
       * photos, or files uploaded outside the product image service.
       */

      if (!metadata) {
        logger.info(
          "Ignoring Storage object without valid product-image metadata.",
          {
            originalImagePath,
          }
        );

        return;
      }

      const {
        productId,
        storeId,
        imageId,
      } = metadata;

      logger.info(
        "Starting product image processing.",
        {
          productId,
          storeId,
          imageId,
          originalImagePath,
        }
      );

      try {
        /*
        |--------------------------------------------------------------------------
        | Mark Processing
        |--------------------------------------------------------------------------
        */

        const isCurrentUpload =
          await markProductImageProcessing(
          productId,
          originalImagePath
        );

        if (!isCurrentUpload) {
          logger.info(
            "Skipping an image replaced by a newer upload.",
            {
              productId,
              originalImagePath,
            }
          );

          try {
            await deleteOriginalImage(
              bucketName,
              originalImagePath
            );
          } catch (cleanupError) {
            logger.warn(
              "Unable to delete a replaced original image.",
              {
                productId,
                originalImagePath,
                cleanupError,
              }
            );
          }

          return;
        }

        /*
        |--------------------------------------------------------------------------
        | Download Original
        |--------------------------------------------------------------------------
        */

        const originalBuffer =
          await downloadOriginalImage(
            bucketName,
            originalImagePath
          );

        /*
        |--------------------------------------------------------------------------
        | Optimize
        |--------------------------------------------------------------------------
        */

        const optimizedImage =
          await optimizeProductImage(
            originalBuffer
          );

        /*
        |--------------------------------------------------------------------------
        | Build Optimized Path
        |--------------------------------------------------------------------------
        */

        const optimizedImagePath =
          buildOptimizedImagePath(
            storeId,
            productId,
            imageId
          );

        /*
        |--------------------------------------------------------------------------
        | Upload Optimized Image
        |--------------------------------------------------------------------------
        */

        const {
          optimizedImageUrl,
        } =
          await uploadOptimizedImage({
            bucketName,

            optimizedImagePath,

            buffer:
              optimizedImage.buffer,

            productId,

            storeId,

            imageId,
          });

        /*
        |--------------------------------------------------------------------------
        | Update Product
        |--------------------------------------------------------------------------
        */

        const result:
        ProductImageProcessingResult = {
          productId,

          storeId,

          imageId,

          originalImagePath,

          optimizedImagePath,

          optimizedImageUrl,

          width:
            optimizedImage.width,

          height:
            optimizedImage.height,

          sizeBytes:
            optimizedImage.sizeBytes,

          format:
            optimizedImage.format,
        };

        const {
          updated,
          previousOptimizedImagePath,
        } = await markProductImageReady(
          result
        );

        if (!updated) {
          logger.info(
            "Discarding an image replaced while processing.",
            {
              productId,
              optimizedImagePath,
            }
          );

          await Promise.allSettled([
            deleteOriginalImage(
              bucketName,
              originalImagePath
            ),
            deleteOptimizedImage(
              bucketName,
              optimizedImagePath
            ),
          ]);

          return;
        }

        /*
        |--------------------------------------------------------------------------
        | Delete Original
        |--------------------------------------------------------------------------
        |
        | This happens only after:
        |
        | - Sharp succeeds.
        | - The WebP upload succeeds.
        | - Firestore is updated successfully.
        |
        */

        try {
          await deleteOriginalImage(
            bucketName,
            originalImagePath
          );
        } catch (cleanupError) {
          logger.warn(
            "Unable to delete the processed original image.",
            {
              productId,
              originalImagePath,
              cleanupError,
            }
          );
        }

        if (
          previousOptimizedImagePath &&
          previousOptimizedImagePath !==
            optimizedImagePath
        ) {
          try {
            await deleteOptimizedImage(
              bucketName,
              previousOptimizedImagePath
            );
          } catch (cleanupError) {
            logger.warn(
              "Unable to delete the replaced optimized image.",
              {
                productId,
                previousOptimizedImagePath,
                cleanupError,
              }
            );
          }
        }

        logger.info(
          "Product image processed successfully.",
          {
            productId,
            optimizedImagePath,
            width:
              optimizedImage.width,
            height:
              optimizedImage.height,
            sizeBytes:
              optimizedImage.sizeBytes,
          }
        );
      } catch (processingError) {
        logger.error(
          "Product image processing failed.",
          processingError
        );

        /*
         * Do not delete the original after failure. Keeping it allows future
         * retries and makes debugging easier.
         */

        try {
          await markProductImageFailed(
            productId,
            originalImagePath,
            processingError
          );
        } catch (
          statusError
        ) {
          logger.error(
            "Failed to record product image failure.",
            statusError
          );
        }

        /*
         * Re-throwing tells Cloud Functions that this invocation failed.
         * Depending on retry configuration, Firebase may retry it.
         */

        throw processingError;
      }
    }
  );

/*
|--------------------------------------------------------------------------
| Process Product Image Trigger
|--------------------------------------------------------------------------
|
| Runs automatically whenever an original product image is uploaded.
|
| Primary workflow:
|
| 1. Validate the uploaded object.
| 2. Verify that the upload is still the product's current image.
| 3. Create a temporary signed URL for Claid.
| 4. Submit a conservative async enhancement job.
| 5. Store the Claid job context.
| 6. Mark the product image as enhancing.
| 7. Exit without waiting for Claid.
|
| Fallback workflow:
|
| If Claid submission fails, the Function continues with the existing
| Sharp-only image pipeline so the product still receives an optimized image.
|
*/

import {
  logger,
} from "firebase-functions";

import {
  defineSecret,
} from "firebase-functions/params";

import {
  onObjectFinalized,
} from "firebase-functions/v2/storage";

import {
  claidService,
} from "../claid/claidService";

import {
  createClaidJob,
} from "../claid/claidJobStore";

import {
  createOriginalImageSignedUrl,
} from "../claid/claidStorage";

import {
  markProductImageEnhancing,
  markProductImageFailed,
  markProductImageProcessing,
  markProductImageReady,
} from "./imageFirestore";

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
  PRODUCT_IMAGE_CONFIG,
} from "./imageTypes";

import type {
  ProductImageMetadata,
  ProductImageProcessingResult,
} from "./imageTypes";

/*
|--------------------------------------------------------------------------
| Claid Secret
|--------------------------------------------------------------------------
|
| Stored in Google Secret Manager and attached only to Functions that need it.
|
*/

const CLAID_API_KEY =
  defineSecret(
    "CLAID_API_KEY"
  );

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

      memory:
        "1GiB",

      timeoutSeconds:
        120,

      secrets: [
        CLAID_API_KEY,
      ],
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
       * Prevent the optimized WebP from triggering this Function again.
       */

      if (
        originalImagePath.includes(
          "/optimized/"
        )
      ) {
        return;
      }

      /*
       * Ignore non-image uploads.
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
       * Ignore banners, profile images, and unrelated Storage uploads.
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
        "Starting product image workflow.",
        {
          productId,
          storeId,
          imageId,
          originalImagePath,
          bucketName,
        }
      );

      try {
        /*
        |--------------------------------------------------------------------------
        | Confirm Current Upload
        |--------------------------------------------------------------------------
        |
        | A store owner may select another image before this trigger begins.
        | Only the image currently referenced by the product may continue.
        |
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
        | Submit Claid Enhancement
        |--------------------------------------------------------------------------
        |
        | Claid performs conservative cleanup only:
        |
        | - Remove the existing background
        | - Place the real product on a transparent square canvas
        | - Add consistent padding
        | - Apply mild exposure, contrast, saturation, and sharpness changes
        |
        | No generative background or synthetic product content is requested.
        |
        | When accepted, the scheduled pollClaidImageJobs Function completes
        | the workflow later. This trigger exits without waiting.
        |
        */

        try {
          const apiKey =
            CLAID_API_KEY.value();

          const signedInputUrl =
            await createOriginalImageSignedUrl(
              bucketName,
              originalImagePath
            );

          const acceptedTask =
            await claidService
              .submitProductImage({
                inputUrl:
                  signedInputUrl,

                apiKey,
              });

          /*
           * Save the task context before changing the product status.
           */

          await createClaidJob({
            taskId:
              acceptedTask.id,

            resultUrl:
              acceptedTask.result_url,

            productId,

            storeId,

            imageId,

            bucketName,

            originalImagePath,
          });

          const markedEnhancing =
            await markProductImageEnhancing(
              productId,
              originalImagePath,
              acceptedTask.id
            );

          /*
           * A newer upload may have replaced this image while Claid was
           * accepting the task.
           */

          if (!markedEnhancing) {
            logger.info(
              "Claid accepted a task for an image that is no longer current.",
              {
                taskId:
                  acceptedTask.id,

                productId,

                originalImagePath,
              }
            );

            /*
             * The scheduled poller will safely discard the eventual result
             * because the originalImagePath concurrency token no longer
             * matches the product.
             */

            return;
          }

          logger.info(
            "Product image submitted to Claid successfully.",
            {
              taskId:
                acceptedTask.id,

              productId,

              storeId,

              imageId,

              originalImagePath,

              bucketName,
            }
          );

          /*
           * Claid and pollClaidImageJobs now own the remaining workflow.
           */

          return;
        } catch (
          claidSubmissionError
        ) {
          /*
           * Claid is an enhancement layer, not a hard dependency.
           *
           * If Claid cannot accept the task, continue with the original
           * Sharp-only pipeline.
           */

          logger.warn(
            "Claid submission failed. Continuing with Sharp-only fallback.",
            {
              productId,

              storeId,

              imageId,

              originalImagePath,

              claidSubmissionError: {
                name:
                  claidSubmissionError instanceof Error
                    ? claidSubmissionError.name
                    : "UnknownError",

                message:
                  claidSubmissionError instanceof Error
                    ? claidSubmissionError.message
                    : String(claidSubmissionError),

                stack:
                  claidSubmissionError instanceof Error
                    ? claidSubmissionError.stack
                    : undefined,
              },
            }
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Sharp-Only Fallback
        |--------------------------------------------------------------------------
        |
        | This section is reached only if Claid submission failed.
        |
        */

        const originalBuffer =
          await downloadOriginalImage(
            bucketName,
            originalImagePath
          );

        const optimizedImage =
          await optimizeProductImage(
            originalBuffer
          );

        const optimizedImagePath =
          buildOptimizedImagePath(
            storeId,
            productId,
            imageId
          );

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
        } =
          await markProductImageReady(
            result
          );

        /*
         * The store owner may have selected a replacement while Sharp was
         * processing this fallback image.
         */

        if (!updated) {
          logger.info(
            "Discarding a fallback image replaced while processing.",
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
        | Fallback Cleanup
        |--------------------------------------------------------------------------
        */

        try {
          await deleteOriginalImage(
            bucketName,
            originalImagePath
          );
        } catch (cleanupError) {
          logger.warn(
            "Unable to delete the Sharp fallback original image.",
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
          "Product image completed through Sharp-only fallback.",
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
          "Product image workflow failed.",
          {
            productId,
            storeId,
            imageId,
            originalImagePath,
            processingError,
          }
        );

        /*
         * Only the current upload may mark the product as failed.
         */

        try {
          await markProductImageFailed(
            productId,
            originalImagePath,
            processingError
          );
        } catch (statusError) {
          logger.error(
            "Failed to record product image failure.",
            {
              productId,
              originalImagePath,
              statusError,
            }
          );
        }

        /*
         * Keep the original after failure for debugging or a future retry.
         */

        throw processingError;
      }
    }
  );

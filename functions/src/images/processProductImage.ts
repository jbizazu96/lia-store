/*
|--------------------------------------------------------------------------
| Process Product Gallery Image Trigger
|--------------------------------------------------------------------------
|
| Runs when a front or back product image is uploaded.
|
| Workflow:
|
| 1. Validate gallery-image metadata.
| 2. Confirm the gallery upload is still current.
| 3. Submit the original to Claid.
| 4. Save the complete gallery job context.
| 5. Mark the gallery image as enhancing.
| 6. Allow the scheduled Claid poller to finish processing.
|
| If Claid submission fails, Sharp creates all responsive variants directly
| from the original upload.
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
  markGalleryImageEnhancing,
  markGalleryImageFailed,
  markGalleryImageProcessing,
  markGalleryImageReady,
} from "./galleryImageFirestore";

import {
  processProductImageVariants,
} from "./imageProcessor";

import {
  deleteOptimizedImage,
  deleteOriginalImage,
  downloadOriginalImage,
  uploadOptimizedImageVariants,
} from "./imageStorage";

import {
  PRODUCT_IMAGE_CONFIG,
} from "./imageTypes";

import type {
  ProductGalleryImageMetadata,
  ProductImageVariantMap,
} from "./imageTypes";

/*
|--------------------------------------------------------------------------
| Claid Secret
|--------------------------------------------------------------------------
*/

const CLAID_API_KEY =
  defineSecret(
    "CLAID_API_KEY"
  );

/*
|--------------------------------------------------------------------------
| Metadata Validation
|--------------------------------------------------------------------------
|
| Only the final front/back gallery workflow is accepted.
|
*/

function getProductImageMetadata(
  metadata:
    | Record<string, string>
    | undefined
): ProductGalleryImageMetadata | null {
  if (!metadata) {
    return null;
  }

  const {
    productId,
    storeId,
    imageId,
    galleryImageId,
    role,
    position,
    altText,
    processingType,
  } = metadata;

  if (
    processingType !==
      PRODUCT_IMAGE_CONFIG
        .GALLERY_PROCESSING_TYPE ||
    !productId?.trim() ||
    !storeId?.trim() ||
    !imageId?.trim() ||
    !galleryImageId?.trim() ||
    (
      role !== "front" &&
      role !== "back"
    ) ||
    (
      position !== "0" &&
      position !== "1"
    )
  ) {
    return null;
  }

  return {
    productId,

    storeId,

    imageId,

    galleryImageId,

    role,

    position:
      position === "0"
        ? 0
        : 1,

    altText:
      altText?.trim() ||
      (
        role === "front"
          ? "Front view of product"
          : "Back label of product"
      ),

    processingType:
      "product-gallery-image-original",
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
        PRODUCT_IMAGE_CONFIG
          .REGION,

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
          "Ignoring Storage event without a bucket or object path."
        );

        return;
      }

      /*
       * Prevent generated variants from retriggering this Function.
       */

      if (
        originalImagePath.includes(
          "/optimized/"
        )
      ) {
        return;
      }

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

      if (!metadata) {
        logger.info(
          "Ignoring Storage object without valid gallery-image metadata.",
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
        galleryImageId,
        role,
        position,
        altText,
      } = metadata;

      logger.info(
        "Starting product gallery image workflow.",
        {
          productId,
          storeId,
          imageId,
          galleryImageId,
          role,
          position,
          originalImagePath,
          bucketName,
        }
      );

      try {
        /*
        |--------------------------------------------------------------------------
        | Confirm Current Gallery Upload
        |--------------------------------------------------------------------------
        */

        const isCurrentUpload =
          await markGalleryImageProcessing({
            productId,

            galleryImageId,

            originalImagePath,
          });

        if (!isCurrentUpload) {
          logger.info(
            "Skipping a gallery image replaced by a newer upload.",
            {
              productId,

              galleryImageId,

              originalImagePath,
            }
          );

          await Promise.allSettled([
            deleteOriginalImage(
              bucketName,
              originalImagePath
            ),
          ]);

          return;
        }

        /*
        |--------------------------------------------------------------------------
        | Submit Claid Enhancement
        |--------------------------------------------------------------------------
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
           * Save complete gallery context so the asynchronous poller can
           * update the correct front or back gallery document.
           */

          await createClaidJob({
            taskId:
              acceptedTask.id,

            resultUrl:
              acceptedTask.result_url,

            productId,

            storeId,

            imageId,

            galleryImageId,

            role,

            position,

            altText,

            bucketName,

            originalImagePath,
          });

          const markedEnhancing =
            await markGalleryImageEnhancing({
              productId,

              galleryImageId,

              originalImagePath,

              claidTaskId:
                acceptedTask.id,
            });

          if (!markedEnhancing) {
            logger.info(
              "Claid accepted a task for a gallery image that is no longer current.",
              {
                taskId:
                  acceptedTask.id,

                productId,

                galleryImageId,

                originalImagePath,
              }
            );

            return;
          }

          logger.info(
            "Product gallery image submitted to Claid.",
            {
              taskId:
                acceptedTask.id,

              productId,

              galleryImageId,

              role,

              originalImagePath,
            }
          );

          /*
           * pollClaidImageJobs now owns the remainder of the successful Claid
           * workflow.
           */

          return;
        } catch (
          claidSubmissionError
        ) {
          logger.warn(
            "Claid submission failed. Continuing with Sharp-only fallback.",
            {
              productId,

              galleryImageId,

              role,

              originalImagePath,

              claidSubmissionError: {
                name:
                  claidSubmissionError instanceof Error
                    ? claidSubmissionError.name
                    : "UnknownError",

                message:
                  claidSubmissionError instanceof Error
                    ? claidSubmissionError.message
                    : String(
                        claidSubmissionError
                      ),

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
        */

        const originalBuffer =
          await downloadOriginalImage(
            bucketName,
            originalImagePath
          );

        const processedVariants =
          await processProductImageVariants(
            originalBuffer
          );

        const uploadedVariants =
          await uploadOptimizedImageVariants({
            bucketName,

            productId,

            storeId,

            imageId,

            variants:
              processedVariants,
          });

        const imageVariants:
        ProductImageVariantMap = {};

        for (
          const variant of
          uploadedVariants
        ) {
          imageVariants[
            variant.name
          ] = variant;
        }

        const {
          updated,
          previousVariantPaths,
        } =
          await markGalleryImageReady({
            productId,

            galleryImageId,

            originalImagePath,

            role,

            imageVariants,

            defaultVariant:
              PRODUCT_IMAGE_CONFIG
                .DEFAULT_VARIANT,
          });

        /*
        |--------------------------------------------------------------------------
        | Discard Stale Results
        |--------------------------------------------------------------------------
        */

        if (!updated) {
          await Promise.allSettled([
            deleteOriginalImage(
              bucketName,
              originalImagePath
            ),

            ...uploadedVariants.map(
              (variant) =>
                deleteOptimizedImage(
                  bucketName,
                  variant.path
                )
            ),
          ]);

          return;
        }

        /*
        |--------------------------------------------------------------------------
        | Cleanup
        |--------------------------------------------------------------------------
        */

        const newVariantPaths =
          new Set(
            uploadedVariants.map(
              (variant) =>
                variant.path
            )
          );

        await Promise.allSettled([
          deleteOriginalImage(
            bucketName,
            originalImagePath
          ),

          ...previousVariantPaths
            .filter(
              (path) =>
                !newVariantPaths.has(
                  path
                )
            )
            .map(
              (path) =>
                deleteOptimizedImage(
                  bucketName,
                  path
                )
            ),
        ]);

        logger.info(
          "Gallery image variants completed through Sharp-only fallback.",
          {
            productId,

            galleryImageId,

            role,

            defaultVariant:
              PRODUCT_IMAGE_CONFIG
                .DEFAULT_VARIANT,

            variantCount:
              uploadedVariants.length,
          }
        );
      } catch (processingError) {
        logger.error(
          "Product gallery image workflow failed.",
          {
            productId,

            storeId,

            imageId,

            galleryImageId,

            role,

            originalImagePath,

            processingError,
          }
        );

        try {
          await markGalleryImageFailed({
            productId,

            galleryImageId,

            originalImagePath,

            error:
              processingError,
          });
        } catch (statusError) {
          logger.error(
            "Failed to record gallery image failure.",
            {
              productId,

              galleryImageId,

              originalImagePath,

              statusError,
            }
          );
        }

        /*
         * Keep the original after failure for investigation or retry.
         */

        throw processingError;
      }
    }
  );
/*
|--------------------------------------------------------------------------
| Poll Claid Gallery Image Jobs
|--------------------------------------------------------------------------
|
| Periodically checks asynchronous Claid image-enhancement jobs.
|
| Every job represents exactly one product gallery image:
|
| - Front image
| - Back image
|
| Workflow:
|
| 1. Load pending Claid jobs.
| 2. Check each task's current Claid status.
| 3. Keep unfinished jobs pending.
| 4. Download completed Claid output.
| 5. Generate four responsive WebP variants with Sharp.
| 6. Update the correct gallery-image document.
| 7. Mirror the front image onto the parent product document.
| 8. Remove temporary and replaced files.
|
*/

import {
  logger,
} from "firebase-functions";

import {
  defineSecret,
} from "firebase-functions/params";

import {
  onSchedule,
} from "firebase-functions/v2/scheduler";

import {
  claidService,
} from "./claidService";

import {
  deleteClaidJob,
  listPendingClaidJobs,
  scheduleClaidJobRetry,
  updateClaidJob,
} from "./claidJobStore";

import {
  markGalleryImageFailed,
  markGalleryImageReady,
} from "../images/galleryImageFirestore";

import {
  processProductImageVariants,
} from "../images/imageProcessor";

import {
  deleteOptimizedImage,
  deleteOriginalImage,
  uploadOptimizedImageVariants,
} from "../images/imageStorage";

import {
  PRODUCT_IMAGE_CONFIG,
} from "../images/imageTypes";

import type {
  ClaidProductImageJob,
  ClaidResultImage,
  ClaidTaskResult,
} from "./claidTypes";

import type {
  ProductImageVariantMap,
} from "../images/imageTypes";

/*
|--------------------------------------------------------------------------
| Secret
|--------------------------------------------------------------------------
*/

const CLAID_API_KEY =
  defineSecret(
    "CLAID_API_KEY"
  );

/*
|--------------------------------------------------------------------------
| Resolve Completed Output URL
|--------------------------------------------------------------------------
*/

function getCompletedImageUrl(
  task: ClaidTaskResult
): string | null {
  const output =
    task.result?.output_object ??
    task.result?.output_objects?.[0] ??
    task.output;

  const result =
    Array.isArray(output)
      ? output[0]
      : output;

  const image =
    result as
      | ClaidResultImage
      | undefined;

  return (
    image?.tmp_url ??
    image?.download_url ??
    image?.url ??
    null
  );
}

/*
|--------------------------------------------------------------------------
| Download Claid Result
|--------------------------------------------------------------------------
*/

async function downloadClaidResult(
  resultUrl: string
): Promise<Buffer> {
  const response =
    await fetch(
      resultUrl
    );

  if (!response.ok) {
    throw new Error(
      `Failed to download Claid result with status ${response.status}.`
    );
  }

  const arrayBuffer =
    await response.arrayBuffer();

  const buffer =
    Buffer.from(
      arrayBuffer
    );

  if (buffer.length === 0) {
    throw new Error(
      "Claid returned an empty enhanced image."
    );
  }

  return buffer;
}

/*
|--------------------------------------------------------------------------
| Mark Permanent Gallery Failure
|--------------------------------------------------------------------------
*/

async function markPermanentFailure(
  job: ClaidProductImageJob,
  error: unknown
): Promise<void> {
  await markGalleryImageFailed({
    productId:
      job.productId,

    galleryImageId:
      job.galleryImageId,

    originalImagePath:
      job.originalImagePath,

    error,
  });
}

/*
|--------------------------------------------------------------------------
| Process One Claid Job
|--------------------------------------------------------------------------
*/

async function processJob(
  job: ClaidProductImageJob,
  apiKey: string
): Promise<void> {
  /*
  |--------------------------------------------------------------------------
  | Missing Result URL
  |--------------------------------------------------------------------------
  */

  if (!job.resultUrl) {
    const missingUrlError =
      new Error(
        "Claid result URL is missing."
      );

    await updateClaidJob({
      taskId:
        job.taskId,

      status:
        "failed",

      error:
        missingUrlError.message,
    });

    await markPermanentFailure(
      job,
      missingUrlError
    );

    return;
  }

  try {
    const task =
      await claidService
        .getTaskResult({
          resultUrl:
            job.resultUrl,

          apiKey,
        });

    /*
    |--------------------------------------------------------------------------
    | Still Processing
    |--------------------------------------------------------------------------
    */

    if (
      task.status ===
        "ACCEPTED" ||
      task.status ===
        "PROCESSING"
    ) {
      await updateClaidJob({
        taskId:
          job.taskId,

        status:
          task.status ===
            "ACCEPTED"
            ? "accepted"
            : "processing",

        error:
          null,
      });

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | Claid Reported Failure
    |--------------------------------------------------------------------------
    */

    if (
      task.status ===
      "ERROR"
    ) {
      const taskError =
        new Error(
          task.error?.message ??
          "Claid enhancement failed."
        );

      await updateClaidJob({
        taskId:
          job.taskId,

        status:
          "failed",

        error:
          taskError.message,
      });

      await markPermanentFailure(
        job,
        taskError
      );

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | Resolve Completed Image
    |--------------------------------------------------------------------------
    */

    const completedImageUrl =
      getCompletedImageUrl(
        task
      );

    if (!completedImageUrl) {
      throw new Error(
        "Claid completed without returning an image URL."
      );
    }

    const enhancedBuffer =
      await downloadClaidResult(
        completedImageUrl
      );

    /*
    |--------------------------------------------------------------------------
    | Generate Responsive Variants
    |--------------------------------------------------------------------------
    |
    | Claid enhances one source image.
    |
    | Firebase Functions and Sharp create:
    |
    | - thumbnail
    | - small
    | - medium
    | - large
    |
    */

    const processedVariants =
      await processProductImageVariants(
        enhancedBuffer
      );

    const bucketName =
      job.bucketName;

    if (!bucketName) {
      throw new Error(
        "The Claid job is missing its Storage bucket."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Upload Responsive Variants
    |--------------------------------------------------------------------------
    */

    const uploadedVariants =
      await uploadOptimizedImageVariants({
        bucketName,

        productId:
          job.productId,

        storeId:
          job.storeId,

        imageId:
          job.imageId,

        variants:
          processedVariants,
      });

    /*
    |--------------------------------------------------------------------------
    | Build Firestore Variant Map
    |--------------------------------------------------------------------------
    */

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

    /*
    |--------------------------------------------------------------------------
    | Make Gallery Image Ready
    |--------------------------------------------------------------------------
    |
    | Front:
    |
    | - Updates its gallery document.
    | - Mirrors imageUrl and imageVariants onto the parent product.
    |
    | Back:
    |
    | - Updates only its gallery document.
    |
    */

    const {
      updated,
      previousVariantPaths,
    } =
      await markGalleryImageReady({
        productId:
          job.productId,

        galleryImageId:
          job.galleryImageId,

        originalImagePath:
          job.originalImagePath,

        role:
          job.role,

        imageVariants,

        defaultVariant:
          PRODUCT_IMAGE_CONFIG
            .DEFAULT_VARIANT,
      });

    /*
    |--------------------------------------------------------------------------
    | Discard Stale Results
    |--------------------------------------------------------------------------
    |
    | The store owner may have replaced the image while Claid was working.
    |
    */

    if (!updated) {
      await Promise.allSettled(
        uploadedVariants.map(
          (variant) =>
            deleteOptimizedImage(
              bucketName,
              variant.path
            )
        )
      );

      await deleteClaidJob(
        job.taskId
      );

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
        job.originalImagePath
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

    await deleteClaidJob(
      job.taskId
    );

    logger.info(
      "Claid gallery image variants completed successfully.",
      {
        taskId:
          job.taskId,

        productId:
          job.productId,

        galleryImageId:
          job.galleryImageId,

        role:
          job.role,

        defaultVariant:
          PRODUCT_IMAGE_CONFIG
            .DEFAULT_VARIANT,

        variantCount:
          uploadedVariants.length,

        variants:
          uploadedVariants.map(
            (variant) => ({
              name:
                variant.name,

              width:
                variant.width,

              height:
                variant.height,

              sizeBytes:
                variant.sizeBytes,

              path:
                variant.path,
            })
          ),
      }
    );
  } catch (jobError) {
    /*
    |--------------------------------------------------------------------------
    | Retry Temporary Failure
    |--------------------------------------------------------------------------
    */

    const retryResult =
      await scheduleClaidJobRetry(
        job.taskId,
        jobError
      );

    if (
      retryResult.willRetry
    ) {
      logger.warn(
        "Claid gallery image job failed temporarily and was scheduled for retry.",
        {
          taskId:
            job.taskId,

          productId:
            job.productId,

          galleryImageId:
            job.galleryImageId,

          role:
            job.role,

          attemptCount:
            retryResult.attemptCount,

          maxAttempts:
            retryResult.maxAttempts,

          nextAttemptAt:
            retryResult.nextAttemptAt,

          error:
            jobError instanceof Error
              ? jobError.message
              : String(
                  jobError
                ),
        }
      );

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | Permanent Failure
    |--------------------------------------------------------------------------
    */

    logger.error(
      "Claid gallery image job permanently failed.",
      {
        taskId:
          job.taskId,

        productId:
          job.productId,

        galleryImageId:
          job.galleryImageId,

        role:
          job.role,

        attemptCount:
          retryResult.attemptCount,

        maxAttempts:
          retryResult.maxAttempts,

        error: {
          name:
            jobError instanceof Error
              ? jobError.name
              : "UnknownError",

          message:
            jobError instanceof Error
              ? jobError.message
              : String(
                  jobError
                ),

          stack:
            jobError instanceof Error
              ? jobError.stack
              : undefined,
        },
      }
    );

    await markPermanentFailure(
      job,
      jobError
    );
  }
}

/*
|--------------------------------------------------------------------------
| Scheduled Function
|--------------------------------------------------------------------------
*/

export const pollClaidImageJobs =
  onSchedule(
    {
      schedule:
        "every 1 minutes",

      region:
        PRODUCT_IMAGE_CONFIG
          .REGION,

      timeZone:
        "America/Chicago",

      memory:
        "1GiB",

      timeoutSeconds:
        300,

      maxInstances:
        1,

      secrets: [
        CLAID_API_KEY,
      ],
    },

    async () => {
      const apiKey =
        CLAID_API_KEY.value();

      const jobs =
        await listPendingClaidJobs({
          limit:
            20,
        });

      if (
        jobs.length === 0
      ) {
        return;
      }

      logger.info(
        "Polling Claid gallery image jobs.",
        {
          count:
            jobs.length,
        }
      );

      await Promise.allSettled(
        jobs.map(
          (job) =>
            processJob(
              job,
              apiKey
            )
        )
      );
    }
  );
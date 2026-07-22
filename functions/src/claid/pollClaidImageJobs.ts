/*
|--------------------------------------------------------------------------
| Poll Claid Image Jobs
|--------------------------------------------------------------------------
|
| Periodically checks asynchronous Claid image-editing jobs.
|
| Workflow:
|
| - Load a limited batch of accepted/processing jobs.
| - Ask Claid for the current task result.
| - Keep unfinished jobs pending.
| - Download completed enhanced images.
| - Run the existing Sharp/WebP pipeline.
| - Update Firestore only if the upload is still current.
| - Clean up the original, replaced optimized image, and completed job.
|
*/

import {
  onSchedule,
} from "firebase-functions/v2/scheduler";

import {
  defineSecret,
} from "firebase-functions/params";

import {
  logger,
} from "firebase-functions";

import {
  claidService,
} from "./claidService";

import {
  deleteClaidJob,
  listPendingClaidJobs,
  updateClaidJob,
} from "./claidJobStore";

import {
  processProductImage,
} from "../images/imageProcessor";

import {
  buildOptimizedImagePath,
  deleteOptimizedImage,
  deleteOriginalImage,
  uploadOptimizedImage,
} from "../images/imageStorage";

import {
  markProductImageEnhancementFailed,
  markProductImageReady,
} from "../images/imageFirestore";

import {
  PRODUCT_IMAGE_CONFIG,
} from "../images/imageTypes";

import type {
  ClaidProductImageJob,
  ClaidResultImage,
  ClaidTaskResult,
} from "./claidTypes";

import type {
  ProductImageProcessingResult,
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
    await fetch(resultUrl);

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
| Process One Job
|--------------------------------------------------------------------------
*/

async function processJob(
  job: ClaidProductImageJob,
  apiKey: string
): Promise<void> {
  if (!job.resultUrl) {
    await updateClaidJob({
      taskId:
        job.taskId,

      status:
        "failed",

      error:
        "Claid result URL is missing.",
    });

    await markProductImageEnhancementFailed(
      job.productId,
      job.originalImagePath,
      new Error(
        "Claid result URL is missing."
      )
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
      });

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | Claid Failure
    |--------------------------------------------------------------------------
    */

    if (
      task.status ===
      "ERROR"
    ) {
      const message =
        task.error?.message ??
        "Claid enhancement failed.";

      await updateClaidJob({
        taskId:
          job.taskId,

        status:
          "failed",

        error:
          message,
      });

      await markProductImageEnhancementFailed(
        job.productId,
        job.originalImagePath,
        new Error(message)
      );

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | Completed Result
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
     * Sharp remains LIA's final authority for dimensions, WebP conversion,
     * compression, and output consistency.
     */

    const optimizedImage =
      await processProductImage(
        enhancedBuffer
      );

    const optimizedImagePath =
      buildOptimizedImagePath(
        job.storeId,
        job.productId,
        job.imageId
      );

    const bucketName =
        job.bucketName;

        if (!bucketName) {
        throw new Error(
            "The Claid job is missing its Storage bucket."
        );
        }

    const {
      optimizedImageUrl,
    } =
      await uploadOptimizedImage({
        bucketName,

        optimizedImagePath,

        buffer:
          optimizedImage.buffer,

        productId:
          job.productId,

        storeId:
          job.storeId,

        imageId:
          job.imageId,
      });

    const result:
    ProductImageProcessingResult = {
      productId:
        job.productId,

      storeId:
        job.storeId,

      imageId:
        job.imageId,

      originalImagePath:
        job.originalImagePath,

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

    if (!updated) {
      await deleteOptimizedImage(
        bucketName,
        optimizedImagePath
      );

      await deleteClaidJob(
        job.taskId
      );

      return;
    }

    await Promise.allSettled([
      deleteOriginalImage(
        bucketName,
        job.originalImagePath
      ),

      previousOptimizedImagePath &&
      previousOptimizedImagePath !==
        optimizedImagePath
        ? deleteOptimizedImage(
            bucketName,
            previousOptimizedImagePath
          )
        : Promise.resolve(),
    ]);

    await deleteClaidJob(
      job.taskId
    );

    logger.info(
      "Claid product image completed successfully.",
      {
        taskId:
          job.taskId,

        productId:
          job.productId,

        optimizedImagePath,
      }
    );
  } catch (jobError) {
    logger.error(
      "Claid image job processing failed.",
      {
        taskId:
          job.taskId,

        productId:
          job.productId,

        jobError: {
          name:
            jobError instanceof Error
              ? jobError.name
              : "UnknownError",

          message:
            jobError instanceof Error
              ? jobError.message
              : String(jobError),

          stack:
            jobError instanceof Error
              ? jobError.stack
              : undefined,
        },
      }
    );

    await updateClaidJob({
      taskId:
        job.taskId,

      status:
        "failed",

      error:
        jobError instanceof Error
          ? jobError.message
          : "Claid job processing failed.",
    });

    await markProductImageEnhancementFailed(
      job.productId,
      job.originalImagePath,
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
        PRODUCT_IMAGE_CONFIG.REGION,

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
          limit: 20,
        });

      if (
        jobs.length === 0
      ) {
        return;
      }

      logger.info(
        "Polling Claid image jobs.",
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

/*
|--------------------------------------------------------------------------
| Claid Job Store
|--------------------------------------------------------------------------
|
| Persists Claid task context in Firestore.
|
| Claid processing is asynchronous, so the webhook must later determine:
|
| - Which product started the task.
| - Which store owns the product.
| - Which original image belongs to the task.
| - Whether the image was replaced while Claid was processing.
|
| This file contains no HTTP, Storage, Sharp, or trigger logic.
|
*/

import {
  FieldValue,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";

import type {
  ClaidImageStatus,
  ClaidProductImageJob,
} from "./claidTypes";

/*
|--------------------------------------------------------------------------
| Collection
|--------------------------------------------------------------------------
*/

const CLAID_JOB_COLLECTION =
  "claidImageJobs";

  /*
|--------------------------------------------------------------------------
| Retry Configuration
|--------------------------------------------------------------------------
*/

const DEFAULT_MAX_ATTEMPTS =
  3;

  /*
|--------------------------------------------------------------------------
| Retry Delays
|--------------------------------------------------------------------------
|
| attemptCount represents attempts that have already started.
|
| After attempt 1 fails: wait 30 seconds.
| After attempt 2 fails: wait 2 minutes.
| Attempt 3 is the final attempt.
|
*/

const RETRY_DELAY_MS = [
  30 * 1000,
  2 * 60 * 1000,
] as const;

/*
|--------------------------------------------------------------------------
| Create Job Parameters
|--------------------------------------------------------------------------
*/

interface CreateClaidJobParams {
  taskId: number;

  resultUrl: string;

  productId: string;

  storeId: string;

  imageId: string;

  bucketName: string;

  originalImagePath: string;
}

/*
|--------------------------------------------------------------------------
| Create Claid Job
|--------------------------------------------------------------------------
*/

export async function createClaidJob({
  taskId,
  resultUrl,
  productId,
  storeId,
  imageId,
  bucketName,
  originalImagePath,
}: CreateClaidJobParams): Promise<void> {
  if (!resultUrl.trim()) {
      throw new Error(
        "A Claid result URL is required."
      );
    }

  if (
    !Number.isFinite(taskId) ||
    taskId <= 0
  ) {
    throw new Error(
      "A valid Claid task ID is required."
    );
  }

  if (
    !productId.trim() ||
    !storeId.trim() ||
    !imageId.trim() ||
    !bucketName.trim() ||
    !originalImagePath.trim()
  ) {
    throw new Error(
      "Complete product image context is required."
    );
  }

  await getFirestore("default")
    .collection(
      CLAID_JOB_COLLECTION
    )
    .doc(taskId.toString())
    .set({
      taskId,

      productId,

      storeId,

      imageId,

      bucketName,

      originalImagePath,

      /*
       * This path acts as the concurrency token.
       *
       * If the store owner uploads a replacement, the webhook must not allow
       * this older task to become the customer-facing image.
       */

      expectedOriginalImagePath:
        originalImagePath,

      status:
        "accepted",

      attemptCount:
        0,

      maxAttempts:
        DEFAULT_MAX_ATTEMPTS,

      nextAttemptAt:
        null,

      lastAttemptAt:
        null,

      resultUrl,

      error:
        null,

      createdAt:
        FieldValue.serverTimestamp(),

      updatedAt:
        FieldValue.serverTimestamp(),
    });
}

/*
|--------------------------------------------------------------------------
| Get Claid Job
|--------------------------------------------------------------------------
*/

export async function getClaidJob(
  taskId: number
): Promise<ClaidProductImageJob | null> {
  if (
    !Number.isFinite(taskId) ||
    taskId <= 0
  ) {
    return null;
  }

  const snapshot =
    await getFirestore("default")
      .collection(
        CLAID_JOB_COLLECTION
      )
      .doc(taskId.toString())
      .get();

  if (!snapshot.exists) {
    return null;
  }

  const data =
    snapshot.data();

  if (!data) {
    return null;
  }

  return {
    taskId:
      data.taskId,

    productId:
      data.productId,

    storeId:
      data.storeId,

    imageId:
      data.imageId,

    bucketName:
      typeof data.bucketName ===
        "string"
        ? data.bucketName
        : "",

    originalImagePath:
      data.originalImagePath,

    expectedOriginalImagePath:
      data.expectedOriginalImagePath,

    status:
      data.status,

      attemptCount:
    typeof data.attemptCount ===
      "number"
      ? data.attemptCount
      : 0,

    maxAttempts:
      typeof data.maxAttempts ===
        "number"
        ? data.maxAttempts
        : DEFAULT_MAX_ATTEMPTS,

    nextAttemptAt:
      data.nextAttemptAt
        ?.toDate?.()
        ?.toISOString?.() ??
      null,

    lastAttemptAt:
      data.lastAttemptAt
        ?.toDate?.()
        ?.toISOString?.() ??
      null,

    resultUrl:
      data.resultUrl ?? null,

    error:
      data.error ?? null,

    createdAt:
      data.createdAt
        ?.toDate?.()
        ?.toISOString?.(),

    updatedAt:
      data.updatedAt
        ?.toDate?.()
        ?.toISOString?.(),
  } as ClaidProductImageJob;
}

/*
|--------------------------------------------------------------------------
| Update Claid Job
|--------------------------------------------------------------------------
*/

interface UpdateClaidJobParams {
  taskId: number;

  status: ClaidImageStatus;

  resultUrl?: string | null;

  error?: string | null;
}

export async function updateClaidJob({
  taskId,
  status,
  resultUrl,
  error,
}: UpdateClaidJobParams): Promise<void> {
  if (
    !Number.isFinite(taskId) ||
    taskId <= 0
  ) {
    return;
  }

  const updates: {
    status: ClaidImageStatus;
    updatedAt: FieldValue;
    resultUrl?: string | null;
    error?: string | null;
  } = {
    status,

    updatedAt:
      FieldValue.serverTimestamp(),
  };

  if (
    resultUrl !== undefined
  ) {
    updates.resultUrl =
      resultUrl;
  }

  if (error !== undefined) {
    updates.error =
      error;
  }

  await getFirestore("default")
    .collection(
      CLAID_JOB_COLLECTION
    )
    .doc(taskId.toString())
    .set(
      updates,
      {
        merge: true,
      }
    );
}

/*
|--------------------------------------------------------------------------
| List Pending Claid Jobs
|--------------------------------------------------------------------------
|
| Returns a limited batch of jobs that still require status checks.
|
| The limit prevents one scheduler invocation from processing an unlimited
| number of documents.
|
*/

interface ListPendingClaidJobsOptions {
  limit?: number;
}

export async function listPendingClaidJobs({
  limit = 20,
}: ListPendingClaidJobsOptions = {}):
Promise<ClaidProductImageJob[]> {
  const safeLimit =
    Math.min(
      Math.max(
        Math.floor(limit),
        1
      ),
      100
    );

  const snapshot =
    await getFirestore("default")
      .collection(
        CLAID_JOB_COLLECTION
      )
      .where(
        "status",
        "in",
        [
          "accepted",
          "processing",
        ]
      )
      .limit(
        safeLimit
      )
      .get();

  return snapshot.docs
    .map((document) => {
      const data =
        document.data();

      if (
        typeof data.bucketName !==
           "string" ||
        typeof data.taskId !==
          "number" ||
        typeof data.productId !==
          "string" ||
        typeof data.storeId !==
          "string" ||
        typeof data.imageId !==
          "string" ||
        typeof data.originalImagePath !==
          "string" ||
        typeof data.expectedOriginalImagePath !==
          "string"
      ) {
        return null;
      }

            const job:
              ClaidProductImageJob = {
                taskId:
                  data.taskId,

                productId:
                  data.productId,

                storeId:
                  data.storeId,

                imageId:
                  data.imageId,

                bucketName:
                  data.bucketName,
                  
                originalImagePath:
                  data.originalImagePath,

                expectedOriginalImagePath:
                  data.expectedOriginalImagePath,

                status:
                  data.status as
                    ClaidImageStatus,

                attemptCount:
                  typeof data.attemptCount ===
                    "number"
                    ? data.attemptCount
                    : 0,

                maxAttempts:
                  typeof data.maxAttempts ===
                    "number"
                    ? data.maxAttempts
                    : DEFAULT_MAX_ATTEMPTS,

                nextAttemptAt:
                  data.nextAttemptAt
                    ?.toDate?.()
                    ?.toISOString?.() ??
                  null,

                lastAttemptAt:
                  data.lastAttemptAt
                    ?.toDate?.()
                    ?.toISOString?.() ??
                  null,

                resultUrl:
                  typeof data.resultUrl ===
                    "string"
                    ? data.resultUrl
                    : null,

                error:
                  typeof data.error ===
                    "string"
                    ? data.error
                    : null,

                createdAt:
                  data.createdAt
                    ?.toDate?.()
                    ?.toISOString?.(),

                updatedAt:
                  data.updatedAt
                    ?.toDate?.()
                    ?.toISOString?.(),
              };

              return job;
    })
      .filter(
          (
            job
          ): job is ClaidProductImageJob =>
            job !== null
        )
        .filter(
          (job) => {
            if (!job.nextAttemptAt) {
              return true;
            }

            const retryTime =
              new Date(
                job.nextAttemptAt
              ).getTime();

            return (
              Number.isFinite(
                retryTime
              ) &&
              retryTime <= Date.now()
            );
          }
        );
        }

/*
|--------------------------------------------------------------------------
| Claim Claid Job Attempt
|--------------------------------------------------------------------------
|
| Transactionally claims one processing attempt.
|
| This prevents overlapping scheduler invocations from processing the same
| Claid task at the same time.
|
*/

export async function claimClaidJobAttempt(
  taskId: number
): Promise<boolean> {
  if (
    !Number.isFinite(taskId) ||
    taskId <= 0
  ) {
    return false;
  }

  const firestore =
    getFirestore("default");

  const jobReference =
    firestore
      .collection(
        CLAID_JOB_COLLECTION
      )
      .doc(
        taskId.toString()
      );

  return firestore.runTransaction(
    async (transaction) => {
      const jobSnapshot =
        await transaction.get(
          jobReference
        );

      if (!jobSnapshot.exists) {
        return false;
      }

      const data =
        jobSnapshot.data();

      if (!data) {
        return false;
      }

      /*
       * Only unfinished jobs may be claimed.
       */

      if (
        data.status !== "accepted" &&
        data.status !== "processing"
      ) {
        return false;
      }

      const attemptCount =
        typeof data.attemptCount ===
          "number"
          ? data.attemptCount
          : 0;

      const maxAttempts =
        typeof data.maxAttempts ===
          "number"
          ? data.maxAttempts
          : DEFAULT_MAX_ATTEMPTS;

      if (
        attemptCount >=
        maxAttempts
      ) {
        return false;
      }

      /*
       * Respect the scheduled retry time.
       */

      const nextAttemptAt =
        data.nextAttemptAt;

      if (
        nextAttemptAt instanceof
          Timestamp &&
        nextAttemptAt.toMillis() >
          Date.now()
      ) {
        return false;
      }

      transaction.update(
        jobReference,
        {
          attemptCount:
            attemptCount + 1,

          lastAttemptAt:
            FieldValue.serverTimestamp(),

          nextAttemptAt:
            null,

          error:
            null,

          updatedAt:
            FieldValue.serverTimestamp(),
        }
      );

      return true;
    }
  );
}

/*
|--------------------------------------------------------------------------
| Schedule Claid Job Retry
|--------------------------------------------------------------------------
|
| Records a temporary failure and schedules the next processing attempt.
|
| Once maxAttempts is reached, the job becomes permanently failed.
|
*/

export interface ScheduleClaidJobRetryResult {
  willRetry: boolean;

  attemptCount: number;

  maxAttempts: number;

  nextAttemptAt: string | null;
}

export async function scheduleClaidJobRetry(
  taskId: number,
  error: unknown
): Promise<ScheduleClaidJobRetryResult> {
  const fallbackResult:
  ScheduleClaidJobRetryResult = {
    willRetry: false,
    attemptCount: 0,
    maxAttempts:
      DEFAULT_MAX_ATTEMPTS,
    nextAttemptAt: null,
  };

  if (
    !Number.isFinite(taskId) ||
    taskId <= 0
  ) {
    return fallbackResult;
  }

  const message =
    error instanceof Error
      ? error.message
      : "Claid job processing failed.";

  const firestore =
    getFirestore("default");

  const jobReference =
    firestore
      .collection(
        CLAID_JOB_COLLECTION
      )
      .doc(taskId.toString());

  return firestore.runTransaction(
    async (transaction) => {
      const jobSnapshot =
        await transaction.get(
          jobReference
        );

      if (!jobSnapshot.exists) {
        return fallbackResult;
      }

      const data =
        jobSnapshot.data();

      if (!data) {
        return fallbackResult;
      }

      /*
       * Increment only after a real failure.
       *
       * Merely polling a task that is still processing does not count
       * as an attempt.
       */

      const previousAttemptCount =
        typeof data.attemptCount ===
          "number"
          ? data.attemptCount
          : 0;

      const attemptCount =
        previousAttemptCount + 1;

      const maxAttempts =
        typeof data.maxAttempts ===
          "number"
          ? data.maxAttempts
          : DEFAULT_MAX_ATTEMPTS;

      const attemptsExhausted =
        attemptCount >=
        maxAttempts;

      if (attemptsExhausted) {
        transaction.update(
          jobReference,
          {
            status:
              "failed",

            attemptCount,

            lastAttemptAt:
              FieldValue.serverTimestamp(),

            nextAttemptAt:
              null,

            error:
              message,

            updatedAt:
              FieldValue.serverTimestamp(),
          }
        );

        return {
          willRetry:
            false,

          attemptCount,

          maxAttempts,

          nextAttemptAt:
            null,
        };
      }

      /*
       * Attempt 1 failure: wait 30 seconds.
       * Attempt 2 failure: wait 2 minutes.
       */

      const delayIndex =
        Math.min(
          attemptCount - 1,
          RETRY_DELAY_MS.length - 1
        );

      const nextAttemptDate =
        new Date(
          Date.now() +
          RETRY_DELAY_MS[
            delayIndex
          ]
        );

      transaction.update(
        jobReference,
        {
          status:
            "processing",

          attemptCount,

          lastAttemptAt:
            FieldValue.serverTimestamp(),

          nextAttemptAt:
            Timestamp.fromDate(
              nextAttemptDate
            ),

          error:
            message,

          updatedAt:
            FieldValue.serverTimestamp(),
        }
      );

      return {
        willRetry:
          true,

        attemptCount,

        maxAttempts,

        nextAttemptAt:
          nextAttemptDate.toISOString(),
      };
    }
  );
}

/*
|--------------------------------------------------------------------------
| Delete Claid Job
|--------------------------------------------------------------------------
|
| Completed jobs may be removed after the final optimized image is safely
| stored and Firestore has been updated.
|
*/

export async function deleteClaidJob(
  taskId: number
): Promise<void> {
  if (
    !Number.isFinite(taskId) ||
    taskId <= 0
  ) {
    return;
  }

  await getFirestore("default")
    .collection(
      CLAID_JOB_COLLECTION
    )
    .doc(taskId.toString())
    .delete();
}
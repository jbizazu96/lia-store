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
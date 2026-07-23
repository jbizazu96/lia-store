/*
|--------------------------------------------------------------------------
| Claid Types
|--------------------------------------------------------------------------
|
| Shared contracts used by the Claid image-enhancement pipeline.
|
| These types represent:
|
| - Claid async image-edit requests
| - Accepted task responses
| - Processing status responses
| - Webhook payloads
| - LIA-specific job metadata
|
| This file contains no HTTP, Firebase, Sharp, or Firestore logic.
|
*/

/*
|--------------------------------------------------------------------------
| Claid Task Status
|--------------------------------------------------------------------------
|
| Claid async tasks move through these states.
|
*/

export type ClaidTaskStatus =
  | "ACCEPTED"
  | "PROCESSING"
  | "DONE"
  | "ERROR";

/*
|--------------------------------------------------------------------------
| LIA Claid Status
|--------------------------------------------------------------------------
|
| Stored in Firestore using lowercase application-friendly values.
|
*/

export type ClaidImageStatus =
  | "accepted"
  | "processing"
  | "done"
  | "failed";

/*
|--------------------------------------------------------------------------
| Claid Image Input
|--------------------------------------------------------------------------
|
| Claid must be able to download this URL.
|
| Our Firebase Function will provide a temporary signed URL pointing to the
| original image in Firebase Storage.
|
*/

export type ClaidImageInput =
  string;

/*
|--------------------------------------------------------------------------
| Claid Output Configuration
|--------------------------------------------------------------------------
|
| Claid may return its hosted result URL.
|
| Sharp still performs LIA's final:
|
| - 800 × 800 bounding
| - WebP conversion
| - compression
| - Storage upload
| - immutable cache metadata
|
*/

/*
|--------------------------------------------------------------------------
| Claid Background Removal
|--------------------------------------------------------------------------
*/

export interface ClaidBackgroundOperation {
  remove:
    | boolean
    | {
        category:
          | "general"
          | "products"
          | "cars";

        clipping?: boolean;
      };

  color?:
    | string
    | "transparent";
}

/*
|--------------------------------------------------------------------------
| Claid Resizing
|--------------------------------------------------------------------------
*/

export interface ClaidResizingOperation {
  width:
    | number
    | "auto"
    | string;

  height:
    | number
    | "auto"
    | string;

  fit:
    | "bounds"
    | "cover"
    | "canvas"
    | "crop";
}

/*
|--------------------------------------------------------------------------
| Claid Adjustments
|--------------------------------------------------------------------------
*/

export interface ClaidAdjustmentOperation {
  hdr?: number;

  exposure?: number;

  saturation?: number;

  contrast?: number;

  sharpness?: number;
}

/*
|--------------------------------------------------------------------------
| Claid Operations
|--------------------------------------------------------------------------
*/

export interface ClaidImageOperations {
  background?:
    ClaidBackgroundOperation;

  resizing?:
    ClaidResizingOperation;

  adjustments?:
    ClaidAdjustmentOperation;

  /*
   * Percentage padding around the detected product.
   *
   * Examples:
   * "10%"
   * "10% 15%"
   */
  padding?: string;
}

/*
|--------------------------------------------------------------------------
| Claid Output
|--------------------------------------------------------------------------
*/

export interface ClaidImageOutput {
  format?: {
    type:
      | "jpeg"
      | "png"
      | "webp"
      | "avif";

    quality?: number;
  };
}


/*
|--------------------------------------------------------------------------
| Async Edit Request
|--------------------------------------------------------------------------
|
| Sent to:
|
| POST /v1/image/edit/async
|
*/

export interface ClaidAsyncEditRequest {
  input: ClaidImageInput;

  operations: ClaidImageOperations;

  output?: ClaidImageOutput;
}

/*
|--------------------------------------------------------------------------
| Accepted Task
|--------------------------------------------------------------------------
|
| Returned immediately after Claid accepts an asynchronous image-edit job.
|
*/

export interface ClaidAcceptedTask {
  id: number;

  status: "ACCEPTED";

  result_url: string;

  created_at: string;

  request?: ClaidAsyncEditRequest;
}

/*
|--------------------------------------------------------------------------
| Claid Result Image
|--------------------------------------------------------------------------
|
| Claid response structures may include more metadata than LIA needs.
| These optional fields keep our integration resilient while preserving the
| customer-facing output URL we require.
|
*/

export interface ClaidResultImage {
  url?: string;

  download_url?: string;

  /** Temporary result URL returned by Claid's async image-edit API. */
  tmp_url?: string;

  width?: number;

  height?: number;

  format?: string;

  size?: number;
}

export interface ClaidTaskOutput {
  input_object?: ClaidResultImage | null;

  output_object?: ClaidResultImage | null;

  output_objects?: ClaidResultImage[];
}

/*
|--------------------------------------------------------------------------
| Async Task Result
|--------------------------------------------------------------------------
|
| Returned by Claid's task-status endpoint or delivered through a webhook.
|
*/

export interface ClaidTaskResult {
  id: number;

  status: ClaidTaskStatus;

  created_at?: string;

  completed_at?: string;

  result_url?: string;

  output?: ClaidResultImage | ClaidResultImage[];

  /**
   * Claid's async status endpoint returns the completed image here.
   */
  result?: ClaidTaskOutput;

  error?: {
    message?: string;

    code?: string;

    details?: unknown;
  };

  request?: ClaidAsyncEditRequest;
}

/*
|--------------------------------------------------------------------------
| Claid API Wrapper
|--------------------------------------------------------------------------
|
| Claid may wrap endpoint data in a top-level data field.
|
*/

export interface ClaidApiResponse<
  Data
> {
  data?: Data;

  result?: Data;

  error?: {
    message?: string;

    code?: string;

    details?: unknown;
  };
}

/*
|--------------------------------------------------------------------------
| LIA Claid Job Context
|--------------------------------------------------------------------------
|
| Stored in Firestore so an async callback can safely identify the exact
| product upload that initiated the Claid request.
|
*/

export interface ClaidProductImageJob {
  taskId: number;

  productId: string;

  storeId: string;

  imageId: string;

  /*
  * Exact Firebase Storage bucket containing the original image.
  *
  * This is stored because Firebase buckets may use either:
  *
  * - project-id.appspot.com
  * - project-id.firebasestorage.app
  *
  * The background poller should never guess the bucket name.
  */
  bucketName?: string;

  originalImagePath: string;

  /*
   * The original path acts as the concurrency token.
   *
   * A webhook must not update the product if the owner has already selected a
   * newer image.
   */
  expectedOriginalImagePath: string;

  status: ClaidImageStatus;

    /*
  |--------------------------------------------------------------------------
  | Retry State
  |--------------------------------------------------------------------------
  */

  /**
   * Number of failed processing attempts already made.
   */
  attemptCount: number;

  /**
   * Maximum attempts allowed before the job becomes permanently failed.
   */
  maxAttempts: number;

  /**
   * ISO date when the next retry may run.
   *
   * Null means the job may run immediately.
   */
  nextAttemptAt?: string | null;

  /**
   * ISO date of the most recent processing attempt.
   */
  lastAttemptAt?: string | null;

  resultUrl?: string | null;

  error?: string | null;

  createdAt?: string;

  updatedAt?: string;
}

/*
|--------------------------------------------------------------------------
| Claid Webhook Payload
|--------------------------------------------------------------------------
|
| We keep the payload broad enough to support Claid's async callback while
| extracting only fields required by LIA.
|
*/

export interface ClaidWebhookPayload {
  id?: number;

  task_id?: number;

  status?: ClaidTaskStatus;

  result_url?: string;

  output?:
    | ClaidResultImage
    | ClaidResultImage[];

  error?: {
    message?: string;

    code?: string;

    details?: unknown;
  };

  data?: ClaidTaskResult;
}

/*
|--------------------------------------------------------------------------
| Normalized Claid Result
|--------------------------------------------------------------------------
|
| Internal result consumed by the Firebase image pipeline after Claid finishes.
|
*/

export interface NormalizedClaidResult {
  taskId: number;

  status: ClaidImageStatus;

  resultUrl: string | null;

  error: string | null;
}

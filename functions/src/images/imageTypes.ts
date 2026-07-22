/*
|--------------------------------------------------------------------------
| Image Processing Types
|--------------------------------------------------------------------------
|
| Shared types and constants for Firebase Functions image processing.
|
| These values are used by:
|
| - Sharp image conversion
| - Storage helpers
| - Firestore image-status updates
| - Product image trigger
|
*/

/*
|--------------------------------------------------------------------------
| Processing Status
|--------------------------------------------------------------------------
*/

export type ImageProcessingStatus =
  | "processing"
  | "ready"
  | "failed";

/*
|--------------------------------------------------------------------------
| Product Image Metadata
|--------------------------------------------------------------------------
*/

export interface ProductImageMetadata {
  productId: string;

  storeId: string;

  imageId: string;

  processingType:
    | "product-image-original";
}

/*
|--------------------------------------------------------------------------
| Processed Image Result
|--------------------------------------------------------------------------
*/

export interface ProcessedImageResult {
  buffer: Buffer;

  width: number;

  height: number;

  sizeBytes: number;

  format: "webp";
}

/*
|--------------------------------------------------------------------------
| Product Image Processing Result
|--------------------------------------------------------------------------
*/

export interface ProductImageProcessingResult {
  productId: string;

  storeId: string;

  imageId: string;

  originalImagePath: string;

  optimizedImagePath: string;

  optimizedImageUrl: string;

  width: number;

  height: number;

  sizeBytes: number;

  format: "webp";
}

/*
|--------------------------------------------------------------------------
| Image Processing Configuration
|--------------------------------------------------------------------------
*/

export const PRODUCT_IMAGE_CONFIG = {
  /*
   * Maximum optimized dimensions.
   */
  MAX_WIDTH: 800,

  MAX_HEIGHT: 800,

  /*
   * WebP quality from 1 through 100.
   */
  WEBP_QUALITY: 80,

  /*
   * Long-lived caching is safe because every optimized upload uses a
   * unique image ID.
   */
  CACHE_CONTROL:
    "public, max-age=31536000, immutable",

  /*
   * Metadata value used to identify original product uploads.
   */
  PROCESSING_TYPE:
    "product-image-original",

  /*
   * Function region.
   *
   * Keep this aligned with your Storage bucket and other Functions when
   * possible.
   */
  REGION:
    "us-central1",
} as const;
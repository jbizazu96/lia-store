/*
|--------------------------------------------------------------------------
| Image Processor
|--------------------------------------------------------------------------
|
| Contains only Sharp image-processing logic.
|
| Responsibilities:
|
| - Read image metadata.
| - Rotate according to EXIF orientation.
| - Resize within the configured maximum dimensions.
| - Convert to WebP.
| - Return the optimized image buffer and metadata.
|
| This file contains no Firebase Storage or Firestore logic.
|
*/

import sharp from "sharp";

import {
  PRODUCT_IMAGE_CONFIG,
} from "./imageTypes";

import type {
  ProcessedImageResult,
} from "./imageTypes";

/*
|--------------------------------------------------------------------------
| Process Product Image
|--------------------------------------------------------------------------
*/

export async function processProductImage(
  originalImageBuffer: Buffer
): Promise<ProcessedImageResult> {
  if (
    !originalImageBuffer ||
    originalImageBuffer.length === 0
  ) {
    throw new Error(
      "The original image buffer is empty."
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Build Sharp Pipeline
  |--------------------------------------------------------------------------
  |
  | rotate():
  | Applies EXIF orientation so mobile photos are not displayed sideways.
  |
  | resize():
  | Keeps the entire product visible inside 800 × 800.
  |
  | withoutEnlargement:
  | Prevents smaller images from being enlarged and losing quality.
  |
  | webp():
  | Produces a significantly smaller customer-facing image.
  |
  */

  const optimizedImage =
    sharp(originalImageBuffer)
      .rotate()
      .resize({
        width:
          PRODUCT_IMAGE_CONFIG
            .MAX_WIDTH,

        height:
          PRODUCT_IMAGE_CONFIG
            .MAX_HEIGHT,

        fit: "inside",

        withoutEnlargement:
          true,
      })
      .webp({
        quality:
          PRODUCT_IMAGE_CONFIG
            .WEBP_QUALITY,

        effort: 4,
      });

  /*
  |--------------------------------------------------------------------------
  | Generate Buffer And Metadata
  |--------------------------------------------------------------------------
  */

  const {
    data,
    info,
  } =
    await optimizedImage.toBuffer({
      resolveWithObject: true,
    });

  if (
    !info.width ||
    !info.height
  ) {
    throw new Error(
      "The optimized image dimensions could not be determined."
    );
  }

  return {
    buffer: data,

    width:
      info.width,

    height:
      info.height,

    sizeBytes:
      data.length,

    format:
      "webp",
  };
}
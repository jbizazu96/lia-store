/*
|--------------------------------------------------------------------------
| Image Processor
|--------------------------------------------------------------------------
|
| Contains only Sharp image-processing logic.
|
| Responsibilities:
|
| - Rotate images according to EXIF orientation.
| - Resize images without cropping the product.
| - Convert images to WebP.
| - Generate one legacy image or multiple customer-facing variants.
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
  ProcessedImageVariant,
} from "./imageTypes";

/*
|--------------------------------------------------------------------------
| Process Product Image
|--------------------------------------------------------------------------
|
| Legacy single-image processor.
|
| Keep this temporarily while the Storage and Firestore layers are migrated
| to multi-size variants.
|
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

        fit:
          "inside",

        withoutEnlargement:
          true,
      })
      .webp({
        quality:
          PRODUCT_IMAGE_CONFIG
            .WEBP_QUALITY,

        effort:
          4,
      });

  const {
    data,
    info,
  } =
    await optimizedImage.toBuffer({
      resolveWithObject:
        true,
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
    buffer:
      data,

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

/*
|--------------------------------------------------------------------------
| Process Product Image Variants
|--------------------------------------------------------------------------
|
| Generates every configured customer-facing WebP size in parallel.
|
| The original enhanced image buffer is reused for all variants.
|
*/

export async function processProductImageVariants(
  originalImageBuffer: Buffer
): Promise<ProcessedImageVariant[]> {
  if (
    !originalImageBuffer ||
    originalImageBuffer.length === 0
  ) {
    throw new Error(
      "The original image buffer is empty."
    );
  }

  /*
   * Each variant receives its own Sharp pipeline.
   *
   * Promise.all allows the configured sizes to process concurrently.
   */

  return Promise.all(
    PRODUCT_IMAGE_CONFIG.VARIANTS.map(
      async (
        variant
      ): Promise<ProcessedImageVariant> => {
        const {
          data,
          info,
        } =
          await sharp(
            originalImageBuffer
          )
            .rotate()
            .resize({
              width:
                variant.width,

              height:
                variant.height,

              fit:
                "inside",

              withoutEnlargement:
                true,
            })
            .webp({
              quality:
                variant.quality,

              effort:
                4,
            })
            .toBuffer({
              resolveWithObject:
                true,
            });

        if (
          !info.width ||
          !info.height
        ) {
          throw new Error(
            `The ${variant.name} image dimensions could not be determined.`
          );
        }

        return {
          name:
            variant.name,

          buffer:
            data,

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
    )
  );
}
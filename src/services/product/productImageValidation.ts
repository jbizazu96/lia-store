/*
|--------------------------------------------------------------------------
| Product Image Validation
|--------------------------------------------------------------------------
|
| Shared validation used by every product image upload.
|
| This file contains no Firebase, Firestore, or Storage logic.
|
*/

/*
|--------------------------------------------------------------------------
| Supported Image Types
|--------------------------------------------------------------------------
*/

export const SUPPORTED_PRODUCT_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

const IMAGE_TYPE_BY_EXTENSION: Record<
  string,
  (typeof SUPPORTED_PRODUCT_IMAGE_TYPES)[number]
> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

/*
|--------------------------------------------------------------------------
| Maximum Upload Size
|--------------------------------------------------------------------------
*/

const MAX_IMAGE_SIZE_BYTES =
  10 * 1024 * 1024;

/*
|--------------------------------------------------------------------------
| Validate Product Image
|--------------------------------------------------------------------------
*/

export function validateProductImageFile(
  file: File
): (typeof SUPPORTED_PRODUCT_IMAGE_TYPES)[number] {
  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase();

  const contentType =
    SUPPORTED_PRODUCT_IMAGE_TYPES.includes(
      file.type as
        (typeof SUPPORTED_PRODUCT_IMAGE_TYPES)[number]
    )
      ? (file.type as
          (typeof SUPPORTED_PRODUCT_IMAGE_TYPES)[number])
      : extension
        ? IMAGE_TYPE_BY_EXTENSION[
            extension
          ]
        : undefined;

  if (!contentType) {
    throw new Error(
      "Please upload a JPG, PNG, WebP, or HEIC image."
    );
  }

  if (
    file.size >
    MAX_IMAGE_SIZE_BYTES
  ) {
    throw new Error(
      "The image must be 10 MB or smaller."
    );
  }

  if (file.size <= 0) {
    throw new Error(
      "The selected image is empty."
    );
  }

  return contentType;
}
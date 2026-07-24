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
| - Product image triggers
| - Multi-size customer image delivery
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
| Product Image Roles
|--------------------------------------------------------------------------
|
| Front:
| - Primary marketplace image
| - Used on cards, search, cart, checkout, and orders
|
| Back:
| - Secondary image
| - Used on the customer product-details page
|
*/

export type ProductImageRole =
  | "front"
  | "back";

/*
|--------------------------------------------------------------------------
| Product Image Processing Types
|--------------------------------------------------------------------------
*/

export type ProductImageProcessingType =
  | "product-image-original"
  | "product-gallery-image-original";

/*
|--------------------------------------------------------------------------
| Legacy Product Image Metadata
|--------------------------------------------------------------------------
|
| Used by the existing single-primary-image upload flow.
|
*/

export interface LegacyProductImageMetadata {
  productId: string;

  storeId: string;

  imageId: string;

  processingType:
    "product-image-original";
}

/*
|--------------------------------------------------------------------------
| Product Gallery Image Metadata
|--------------------------------------------------------------------------
|
| Used by independently processed front and back gallery images.
|
*/

export interface ProductGalleryImageMetadata {
  productId: string;

  storeId: string;

  imageId: string;

  galleryImageId: string;

  role:
    ProductImageRole;

  position:
    0 | 1;

  altText: string;

  processingType:
    "product-gallery-image-original";
}

/*
|--------------------------------------------------------------------------
| Product Image Metadata
|--------------------------------------------------------------------------
|
| Discriminated union used by Storage-triggered image processing.
|
| Code can safely inspect processingType to determine which workflow applies.
|
*/

export type ProductImageMetadata =
  | LegacyProductImageMetadata
  | ProductGalleryImageMetadata;

/*
|--------------------------------------------------------------------------
| Product Image Variant Names
|--------------------------------------------------------------------------
|
| Each variant serves a different customer interface.
|
| thumbnail:
| Very small lists, compact suggestions, and admin previews.
|
| small:
| Mobile product cards and search results.
|
| medium:
| Larger cards, tablets, and featured products.
|
| large:
| Product details and larger desktop displays.
|
*/

export type ProductImageVariantName =
  | "thumbnail"
  | "small"
  | "medium"
  | "large";

/*
|--------------------------------------------------------------------------
| Product Image Variant Configuration
|--------------------------------------------------------------------------
*/

export interface ProductImageVariantConfig {
  name: ProductImageVariantName;

  width: number;

  height: number;

  quality: number;
}

/*
|--------------------------------------------------------------------------
| Processed Image Result
|--------------------------------------------------------------------------
|
| Represents one image produced by Sharp.
|
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
| Processed Image Variant
|--------------------------------------------------------------------------
|
| Represents one named Sharp output before it is uploaded to Storage.
|
*/

export interface ProcessedImageVariant
  extends ProcessedImageResult {
  name: ProductImageVariantName;
}

/*
|--------------------------------------------------------------------------
| Stored Image Variant
|--------------------------------------------------------------------------
|
| Represents one completed customer-facing image after it has been uploaded
| to Firebase Storage.
|
*/

export interface ProductImageVariantResult {
  name: ProductImageVariantName;

  path: string;

  url: string;

  width: number;

  height: number;

  sizeBytes: number;

  format: "webp";
}

/*
|--------------------------------------------------------------------------
| Product Image Variant Map
|--------------------------------------------------------------------------
|
| Stored in Firestore so the frontend can choose the correct image size.
|
*/

export type ProductImageVariantMap =
  Partial<
    Record<
      ProductImageVariantName,
      ProductImageVariantResult
    >
  >;

/*
|--------------------------------------------------------------------------
| Product Image Processing Result
|--------------------------------------------------------------------------
|
| The legacy optimized-image fields remain temporarily so the current working
| pipeline keeps compiling while we migrate it one file at a time.
|
| imageVariants will become the primary multi-size result.
|
*/

export interface ProductImageProcessingResult {
  productId: string;

  storeId: string;

  imageId: string;

  originalImagePath: string;

  /*
   * Current single-image fields.
   *
   * These remain during the migration.
   */
  optimizedImagePath: string;

  optimizedImageUrl: string;

  width: number;

  height: number;

  sizeBytes: number;

  format: "webp";

  /*
   * New multi-size outputs.
   *
   * Optional during migration so existing functions continue building.
   */
  imageVariants?: ProductImageVariantMap;
}

/*
|--------------------------------------------------------------------------
| Image Processing Configuration
|--------------------------------------------------------------------------
*/

export const PRODUCT_IMAGE_CONFIG = {
  /*
  |--------------------------------------------------------------------------
  | Image Variants
  |--------------------------------------------------------------------------
  |
  | Sharp will generate every size from the same Claid-enhanced image.
  |
  | `fit: inside` will be used later so the complete product remains visible
  | without cropping or distortion.
  |
  */

  VARIANTS: [
    {
      name:
        "thumbnail",

      width:
        200,

      height:
        200,

      quality:
        72,
    },

    {
      name:
        "small",

      width:
        400,

      height:
        400,

      quality:
        76,
    },

    {
      name:
        "medium",

      width:
        600,

      height:
        600,

      quality:
        80,
    },

    {
      name:
        "large",

      width:
        900,

      height:
        900,

      quality:
        82,
    },
  ] satisfies readonly ProductImageVariantConfig[],

  /*
   * The medium variant will eventually remain the default `imageUrl`.
   *
   * This preserves compatibility with components that currently expect one
   * image URL while new components begin using imageVariants.
   */
  DEFAULT_VARIANT:
    "medium" as ProductImageVariantName,

  /*
  |--------------------------------------------------------------------------
  | Legacy Single-Image Settings
  |--------------------------------------------------------------------------
  |
  | Keep these during migration because the existing Sharp processor still
  | reads them.
  |
  | We will remove them after the processor and Storage pipeline are fully
  | converted to variants.
  |
  */

  MAX_WIDTH:
    800,

  MAX_HEIGHT:
    800,

  WEBP_QUALITY:
    80,

  /*
  |--------------------------------------------------------------------------
  | Caching
  |--------------------------------------------------------------------------
  |
  | Every upload uses a unique image ID, so browsers may safely cache each
  | immutable variant for one year.
  |
  */

  CACHE_CONTROL:
    "public, max-age=31536000, immutable",

/*
 * Legacy single-image upload identifier.
 */
PROCESSING_TYPE:
  "product-image-original",

/*
 * Front/back gallery upload identifier.
 */
GALLERY_PROCESSING_TYPE:
  "product-gallery-image-original",

  /*
   * Function region.
   */
  REGION:
    "us-central1",
} as const;
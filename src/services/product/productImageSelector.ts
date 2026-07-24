/*
|--------------------------------------------------------------------------
| Product Image Selector
|--------------------------------------------------------------------------
|
| Centralizes responsive product-image selection.
|
| Components should not manually access:
|
| product.imageVariants?.small?.url
|
| Instead, they should request the variant that best matches the UI.
|
| Legacy products remain supported through product.imageUrl.
|
*/

import type {
  Product,
  ProductImageVariantName,
} from "@/types/product";

/*
|--------------------------------------------------------------------------
| Display Context
|--------------------------------------------------------------------------
|
| These names describe where the image is being rendered.
|
*/

export type ProductImageDisplayContext =
  | "thumbnail"
  | "card"
  | "featured"
  | "details";

/*
|--------------------------------------------------------------------------
| Context To Variant
|--------------------------------------------------------------------------
*/

const CONTEXT_VARIANT_MAP:
Record<
  ProductImageDisplayContext,
  ProductImageVariantName
> = {
  thumbnail:
    "thumbnail",

  card:
    "small",

  featured:
    "medium",

  details:
    "large",
};

/*
|--------------------------------------------------------------------------
| Get Product Image URL
|--------------------------------------------------------------------------
|
| Selection order:
|
| 1. Requested responsive variant
| 2. Medium variant
| 3. Small variant
| 4. Large variant
| 5. Thumbnail variant
| 6. Legacy product.imageUrl
|
| This fallback order protects older products and partially migrated data.
|
*/

export function getProductImageUrl(
  product:
    Pick<
      Product,
      "imageUrl" |
      "imageVariants"
    >,
  context:
    ProductImageDisplayContext =
      "card"
): string {
  const requestedVariant =
    CONTEXT_VARIANT_MAP[
      context
    ];

  return (
    product.imageVariants
      ?.[requestedVariant]
      ?.url ??
    product.imageVariants
      ?.medium
      ?.url ??
    product.imageVariants
      ?.small
      ?.url ??
    product.imageVariants
      ?.large
      ?.url ??
    product.imageVariants
      ?.thumbnail
      ?.url ??
    product.imageUrl ??
    ""
  );
}

/*
|--------------------------------------------------------------------------
| Get Exact Product Image Variant
|--------------------------------------------------------------------------
|
| Useful when a component already knows the exact variant it needs.
|
*/

export function getProductImageVariantUrl(
  product:
    Pick<
      Product,
      "imageUrl" |
      "imageVariants"
    >,
  variant:
    ProductImageVariantName
): string {
  return (
    product.imageVariants
      ?.[variant]
      ?.url ??
    getProductImageUrl(
      product,
      "card"
    )
  );
}

/*
|--------------------------------------------------------------------------
| Product Image Selector Service
|--------------------------------------------------------------------------
|
| Object export is convenient for components that prefer service-style usage.
|
*/

export const productImageSelector = {
  getUrl:
    getProductImageUrl,

  getVariantUrl:
    getProductImageVariantUrl,
};
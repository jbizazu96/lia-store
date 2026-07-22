/*
|--------------------------------------------------------------------------
| Claid Product Image Preset
|--------------------------------------------------------------------------
|
| Defines LIA Store's conservative, non-generative product-photo cleanup.
|
| Goals:
|
| - Preserve the real product exactly as uploaded.
| - Remove distracting backgrounds.
| - Create a consistent square composition.
| - Improve basic lighting and clarity.
| - Add only a subtle natural shadow.
|
| This preset must never generate:
|
| - New objects
| - New packaging
| - New labels
| - New scenery
| - New product colors
|
*/

import type {
  ClaidAsyncEditRequest,
  ClaidImageInput,
} from "./claidTypes";

/*
|--------------------------------------------------------------------------
| Product Image Preset
|--------------------------------------------------------------------------
*/
export function buildProductImagePreset(
  input: ClaidImageInput
): ClaidAsyncEditRequest {
  return {
    input,

    operations: {
      /*
      |--------------------------------------------------------------------------
      | Background
      |--------------------------------------------------------------------------
      */

      background: {
        remove: {
          category:
            "products",

          clipping:
            true,
        },

        // Claid defaults to a white matte unless transparency is explicit.
        color:
          "transparent",
      },

      /*
      |--------------------------------------------------------------------------
      | Square Composition
      |--------------------------------------------------------------------------
      |
      | `canvas` creates the 1:1 composition without cropping the product.
      |
      */

      resizing: {
        width:
          1024,

        height:
          1024,

        fit:
          "canvas",
      },

      /*
      |--------------------------------------------------------------------------
      | Product Padding
      |--------------------------------------------------------------------------
      */

      padding:
        "2%",

      /*
      |--------------------------------------------------------------------------
      | Conservative Corrections
      |--------------------------------------------------------------------------
      */

      adjustments: {
        exposure:
          3,

        contrast:
          4,

        saturation:
          2,

        sharpness:
          5,
      },
    },

    /*
    |--------------------------------------------------------------------------
    | Intermediate Output
    |--------------------------------------------------------------------------
    */

    output: {
      format: {
        type:
          "png",
      },
    },
  };
}

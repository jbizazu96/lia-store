/*
|--------------------------------------------------------------------------
| Product Form Options
|--------------------------------------------------------------------------
|
| Central options used by the store product form.
|
| These values are kept outside the component so the same options can be
| reused by add-product, edit-product, admin tools, and future mobile views.
|
*/

/*
|--------------------------------------------------------------------------
| Size Units
|--------------------------------------------------------------------------
*/

export const PRODUCT_SIZE_UNITS = [
  {
    value: "each",
    label: "Each",
  },
  {
    value: "oz",
    label: "Ounce (oz)",
  },
  {
    value: "lb",
    label: "Pound (lb)",
  },
  {
    value: "g",
    label: "Gram (g)",
  },
  {
    value: "kg",
    label: "Kilogram (kg)",
  },
  {
    value: "ml",
    label: "Milliliter (ml)",
  },
  {
    value: "l",
    label: "Liter (L)",
  },
  {
    value: "pack",
    label: "Pack",
  },
  {
    value: "box",
    label: "Box",
  },
] as const;

/*
|--------------------------------------------------------------------------
| Promotion Types
|--------------------------------------------------------------------------
|
| These values match the shared Promotion domain model.
|
*/

export const PRODUCT_PROMOTION_TYPES = [
  {
    value: "discount",
    label: "Discount",
  },
  {
    value: "bogo",
    label: "Buy One Get One",
  },
  {
    value: "free_shipping",
    label: "Free Shipping",
  },
] as const;
/*
|--------------------------------------------------------------------------
| Product Categories
|--------------------------------------------------------------------------
|
| Central list of product categories used by:
|
| - Store product forms
| - Store product filters
| - Customer product browsing
| - Search
| - Future admin tools
|
| Category values should remain stable because they may be stored in
| Firestore product documents.
|
*/

export interface ProductCategoryOption {
  value: string;

  label: string;
}

export const PRODUCT_CATEGORIES:
ProductCategoryOption[] = [
  {
    value: "produce",
    label: "Produce",
  },

  {
    value: "meat",
    label: "Meat",
  },

  {
    value: "seafood",
    label: "Seafood",
  },

  {
    value: "grains",
    label: "Grains",
  },

  {
    value: "spices",
    label: "Spices",
  },

  {
    value: "beverages",
    label: "Beverages",
  },

  {
    value: "snacks",
    label: "Snacks",
  },

  {
    value: "frozen",
    label: "Frozen Foods",
  },

  {
    value: "canned",
    label: "Canned Goods",
  },

  {
    value: "dairy",
    label: "Dairy",
  },

  {
    value: "bakery",
    label: "Bakery",
  },

  {
    value: "household",
    label: "Household",
  },

  {
    value: "other",
    label: "Other",
  },
];
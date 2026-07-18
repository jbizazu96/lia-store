/*
|--------------------------------------------------------------------------
| Category Mapper
|--------------------------------------------------------------------------
|
| Converts a flat product list into grouped customer-facing categories.
|
| Pages should not contain product-grouping business logic.
|
*/

import type { Category } from "@/types/category";
import type { Product } from "@/types/product";

/*
|--------------------------------------------------------------------------
| Category Icons
|--------------------------------------------------------------------------
*/

const CATEGORY_ICONS: Record<string, string> = {
  produce: "🥬",
  meat: "🥩",
  seafood: "🦞",
  dairy: "🧀",
  pantry: "🥫",
  spices: "🌶️",
  snacks: "🍿",
  beverages: "🥤",
  frozen: "❄️",
  international: "🌍",
  health: "💪",
  household: "🏠",
};

/*
|--------------------------------------------------------------------------
| Category Mapper
|--------------------------------------------------------------------------
*/

export const categoryMapper = {
  /*
  |--------------------------------------------------------------------------
  | Group Products By Category
  |--------------------------------------------------------------------------
  |
  | Takes a flat Product array and returns Category objects.
  |
  | Products without a category are grouped under "Uncategorized".
  |
  */

  fromProducts(
    products: Product[]
  ): Category[] {
    const categoryMap =
      new Map<string, Category>();

    products.forEach((product) => {
      const categoryName =
        product.category?.trim() ||
        "Uncategorized";

      const categoryKey =
        categoryName.toLowerCase();

      if (!categoryMap.has(categoryKey)) {
        categoryMap.set(categoryKey, {
          id: categoryKey.replace(
            /\s+/g,
            "_"
          ),

          name: categoryName,

          icon:
            CATEGORY_ICONS[categoryKey] ??
            "📦",

          products: [],
        });
      }

      categoryMap
        .get(categoryKey)!
        .products.push(product);
    });

    return Array.from(
      categoryMap.values()
    );
  },
};
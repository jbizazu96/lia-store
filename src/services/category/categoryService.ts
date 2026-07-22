/*
|--------------------------------------------------------------------------
| Category Service
|--------------------------------------------------------------------------
|
| Responsible for retrieving Category domain models from Firestore.
|
| Pages and components should never access the "categories"
| collection directly.
|
*/

import {
  collection,
  getDocs,
  orderBy,
  query,
  type DocumentData,
} from "firebase/firestore";

import {
  db,
} from "@/lib/firebase";

import type {
  Category,
} from "@/types/category";

import type {
  Product,
} from "@/types/product";

import {
  productService,
} from "@/services/product/productService";

import {
  PRODUCT_CATEGORIES,
} from "@/config/productCategories";

/*
|--------------------------------------------------------------------------
| Mapper
|--------------------------------------------------------------------------
*/

function mapCategoryDocument(
  categoryId: string,
  data: DocumentData
): Category {
  return {
    id: categoryId,

    name:
      data.name ??
      "Unnamed Category",

  icon:
      data.icon === "Package"
        ? ""
        : data.icon ?? "",

    products: [],
  };
}

/*
|--------------------------------------------------------------------------
| Category Service
|--------------------------------------------------------------------------
*/

export const categoryService = {
  /*
  |--------------------------------------------------------------------------
  | Get Categories
  |--------------------------------------------------------------------------
  */

  async getCategories(): Promise<Category[]> {
    const snapshot =
      await getDocs(
        query(
          collection(
            db,
            "categories"
          ),
          orderBy(
            "name"
          )
        )
      );

    return snapshot.docs.map(
      (document) =>
        mapCategoryDocument(
          document.id,
          document.data()
        )
    );
  },

  /*
  |--------------------------------------------------------------------------
  | Get Categories With Products
  |--------------------------------------------------------------------------
  */

  groupCategoriesWithProducts(
    categories: Category[],
    products: Product[]
  ): Category[] {

    const normalizedCategoryValue = (
      value: string
    ) => value.trim().toLowerCase();

    const categoryLabelByValue =
      new Map(
        PRODUCT_CATEGORIES.map(
          (category) => [
            category.value,
            category.label,
          ]
        )
      );

    const matchesCategory = (
      productCategory: string,
      category: Category
    ) => {
      const productKey =
        normalizedCategoryValue(
          productCategory
        );

      const configuredLabel =
        categoryLabelByValue.get(
          productKey
        );

      const categoryKeys = [
        normalizedCategoryValue(category.id),
        normalizedCategoryValue(category.name),
      ];

      return (
        categoryKeys.includes(productKey) ||
        (configuredLabel !== undefined &&
          categoryKeys.includes(
            normalizedCategoryValue(configuredLabel)
          ))
      );
    };

    const mappedCategories =
      categories.map(
        (category) => ({
          ...category,

          products:
            products.filter(
              (product) =>
                matchesCategory(
                  product.category,
                  category
                )
            ),
        })
      );

    const matchedProductIds =
      new Set(
        mappedCategories.flatMap(
          (category) =>
            category.products.map(
              (product) => product.id
            )
        )
      );

    const unmatchedProducts =
      products.filter(
        (product) =>
          !matchedProductIds.has(product.id)
      );

    const fallbackCategories =
      Array.from(
        unmatchedProducts.reduce(
          (groups, product) => {
            const key =
              normalizedCategoryValue(
                product.category
              );

            const existing = groups.get(key) ?? [];
            existing.push(product);
            groups.set(key, existing);

            return groups;
          },
          new Map<string, typeof products>()
        )
      ).map(
        ([categoryValue, categoryProducts]) => ({
          id: categoryValue,
          name:
            categoryLabelByValue.get(
              categoryValue
            ) ?? categoryValue,
          icon: "",
          products: categoryProducts,
        })
      );

    return [
      ...mappedCategories.filter(
        (category) => category.products.length > 0
      ),
      ...fallbackCategories,
    ];
  },

  async getCategoriesWithProducts(
    storeId: string
  ): Promise<Category[]> {
    const [
      categories,
      products,
    ] = await Promise.all([
      this.getCategories(),

      productService.getAvailableStoreProducts(
        storeId
      ),
    ]);

    return this.groupCategoriesWithProducts(
      categories,
      products
    );
  },
};

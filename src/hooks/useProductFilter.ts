"use client";

/*
|--------------------------------------------------------------------------
| useProductFilter Hook
|--------------------------------------------------------------------------
|
| Handles product searching and category filtering.
|
| Responsibilities:
| - Store the current search query.
| - Store the selected category.
| - Return the filtered product list.
| - Clear search when a category is selected.
|
| The customer store page should only render the result.
|
*/

import {
  useMemo,
  useState,
} from "react";

import type { Category } from "@/types/category";
import type { Product } from "@/types/product";

/*
|--------------------------------------------------------------------------
| Hook Parameters
|--------------------------------------------------------------------------
*/

interface UseProductFilterParams {
  products: Product[];
  categories: Category[];
}

/*
|--------------------------------------------------------------------------
| Hook Result
|--------------------------------------------------------------------------
*/

interface UseProductFilterResult {
  searchQuery: string;

  selectedCategory: string;

  displayProducts: Product[];

  selectedCategoryData:
    | Category
    | undefined;

  isSearching: boolean;

  isFilteringByCategory: boolean;

  setSearchQuery: (
    query: string
  ) => void;

  selectCategory: (
    categoryId: string
  ) => void;

  showAllCategories: () => void;
}

/*
|--------------------------------------------------------------------------
| Hook
|--------------------------------------------------------------------------
*/

export function useProductFilter({
  products,
  categories,
}: UseProductFilterParams): UseProductFilterResult {
  /*
  |--------------------------------------------------------------------------
  | Local Filter State
  |--------------------------------------------------------------------------
  */

  const [
    searchQuery,
    setSearchQuery,
  ] = useState("");

  const [
    selectedCategory,
    setSelectedCategory,
  ] = useState("all");

  /*
  |--------------------------------------------------------------------------
  | Selected Category
  |--------------------------------------------------------------------------
  */

  const selectedCategoryData =
    useMemo(() => {
      if (selectedCategory === "all") {
        return undefined;
      }

      return categories.find(
        (category) =>
          category.id ===
          selectedCategory
      );
    }, [
      categories,
      selectedCategory,
    ]);

  /*
  |--------------------------------------------------------------------------
  | Filtered Products
  |--------------------------------------------------------------------------
  */

  const displayProducts =
    useMemo(() => {
      const normalizedSearch =
        searchQuery
          .trim()
          .toLowerCase();

      /*
       * Search takes priority over category filtering.
       */

      if (normalizedSearch) {
        return products.filter(
          (product) => {
            const productName =
              product.name.toLowerCase();

            const productDescription =
              product.description.toLowerCase();

            const productCategory =
              product.category.toLowerCase();

            return (
              productName.includes(
                normalizedSearch
              ) ||
              productDescription.includes(
                normalizedSearch
              ) ||
              productCategory.includes(
                normalizedSearch
              )
            );
          }
        );
      }

      /*
       * Show every product when no category is selected.
       */

      if (selectedCategory === "all") {
        return products;
      }

      /*
       * Show only products in the selected category.
       */

      return (
        selectedCategoryData?.products ??
        []
      );
    }, [
      products,
      searchQuery,
      selectedCategory,
      selectedCategoryData,
    ]);

  /*
  |--------------------------------------------------------------------------
  | Select Category
  |--------------------------------------------------------------------------
  */

  const selectCategory = (
    categoryId: string
  ) => {
    setSelectedCategory(categoryId);

    /*
     * Category selection replaces active search.
     */

    setSearchQuery("");
  };

  /*
  |--------------------------------------------------------------------------
  | Show All Categories
  |--------------------------------------------------------------------------
  */

  const showAllCategories = () => {
    setSelectedCategory("all");
    setSearchQuery("");
  };

  return {
    searchQuery,

    selectedCategory,

    displayProducts,

    selectedCategoryData,

    isSearching:
      searchQuery.trim().length > 0,

    isFilteringByCategory:
      selectedCategory !== "all",

    setSearchQuery,

    selectCategory,

    showAllCategories,
  };
}
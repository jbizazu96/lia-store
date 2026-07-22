"use client";

/*
|--------------------------------------------------------------------------
| useStoreProductFilters Hook
|--------------------------------------------------------------------------
|
| Handles:
|
| - Product search
| - Category filtering
| - Availability filtering
| - Filtered product results
| - Product statistics
|
| This hook contains no Firebase logic.
|
*/

import {
  useMemo,
  useState,
} from "react";

import type {
  Product,
} from "@/types/product";

/*
|--------------------------------------------------------------------------
| Hook Parameters
|--------------------------------------------------------------------------
*/

interface UseStoreProductFiltersParams {
  products: Product[];
}

/*
|--------------------------------------------------------------------------
| Hook Result
|--------------------------------------------------------------------------
*/

interface UseStoreProductFiltersResult {
  filteredProducts: Product[];

  searchQuery: string;

  categoryFilter: string;

  statusFilter: string;

  hasFilters: boolean;

  stats: {
    totalProducts: number;
    activeProducts: number;
    featuredProducts: number;
    totalStock: number;
    totalValue: number;
  };

  setSearchQuery: (
    value: string
  ) => void;

  setCategoryFilter: (
    value: string
  ) => void;

  setStatusFilter: (
    value: string
  ) => void;

  clearFilters: () => void;
}

/*
|--------------------------------------------------------------------------
| Hook
|--------------------------------------------------------------------------
*/

export function useStoreProductFilters({
  products,
}: UseStoreProductFiltersParams):
UseStoreProductFiltersResult {
  const [
    searchQuery,
    setSearchQuery,
  ] = useState("");

  const [
    categoryFilter,
    setCategoryFilter,
  ] = useState("all");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState("all");

  /*
  |--------------------------------------------------------------------------
  | Filtered Products
  |--------------------------------------------------------------------------
  */

  const filteredProducts =
    useMemo(() => {
      let result = products;

      const normalizedSearch =
        searchQuery
          .trim()
          .toLowerCase();

      if (normalizedSearch) {
        result = result.filter(
          (product) =>
            product.name
              .toLowerCase()
              .includes(
                normalizedSearch
              ) ||
            product.description
              .toLowerCase()
              .includes(
                normalizedSearch
              ) ||
            product.category
              .toLowerCase()
              .includes(
                normalizedSearch
              )
        );
      }

      if (
        categoryFilter !== "all"
      ) {
        result = result.filter(
          (product) =>
            product.category ===
            categoryFilter
        );
      }

      if (
        statusFilter === "active"
      ) {
        result = result.filter(
          (product) =>
            product.isAvailable
        );
      }

      if (
        statusFilter === "inactive"
      ) {
        result = result.filter(
          (product) =>
            !product.isAvailable
        );
      }

      return result;
    }, [
      products,
      searchQuery,
      categoryFilter,
      statusFilter,
    ]);

  /*
  |--------------------------------------------------------------------------
  | Statistics
  |--------------------------------------------------------------------------
  */

  const stats =
    useMemo(
      () => ({
        totalProducts:
          products.length,

        activeProducts:
          products.filter(
            (product) =>
              product.isAvailable
          ).length,

        featuredProducts:
          products.filter(
            (product) =>
              product.featured
          ).length,

        totalStock:
          products.reduce(
            (sum, product) =>
              sum +
              (product.stock || 0),
            0
          ),

        totalValue:
          products.reduce(
            (sum, product) =>
              sum +
              product.price *
                product.stock,
            0
          ),
      }),
      [products]
    );

  /*
  |--------------------------------------------------------------------------
  | Helpers
  |--------------------------------------------------------------------------
  */

  const clearFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setStatusFilter("all");
  };

  const hasFilters =
    searchQuery.trim().length > 0 ||
    categoryFilter !== "all" ||
    statusFilter !== "all";

  return {
    filteredProducts,
    searchQuery,
    categoryFilter,
    statusFilter,
    hasFilters,
    stats,
    setSearchQuery,
    setCategoryFilter,
    setStatusFilter,
    clearFilters,
  };
}
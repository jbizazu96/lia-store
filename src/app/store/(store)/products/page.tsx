"use client";

/*
|--------------------------------------------------------------------------
| Products Management Page
|--------------------------------------------------------------------------
|
| Loads products through useStoreProducts.
| Product writes go through productService.
| This page handles filtering, statistics, redirects, and rendering.
|
*/

import type {
  Product,
} from "@/types/product";

import {
  useStoreProductFilters,
} from "@/hooks/useStoreProductFilters";

import {
  useEffect,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  AnimatePresence,
  motion,
} from "framer-motion";

import {
  AlertCircle,
  Package,
  Plus,
} from "lucide-react";

import Link from "next/link";

import {
  useStoreProducts,
} from "@/hooks/useStoreProducts";

import {
  productService,
} from "@/services/product/productService";

import {
  BrandedLoader,
} from "@/components/ui/BrandedLoader";

import {
  ProductCard,
} from "@/components/store/products/ProductCard";

import {
  ProductFilters,
} from "@/components/store/products/ProductFilters";

import {
  ProductStats,
} from "@/components/store/products/ProductStats";


export default function ProductsPage() {
  const router = useRouter();

  const {
    products,
    loading,
    error,
    isAuthenticated,
    needsStoreSetup,
    refreshProducts,
  } = useStoreProducts();

  const {
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
  } = useStoreProductFilters({
    products,
  });

  /*
  |--------------------------------------------------------------------------
  | Redirects
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }

    if (needsStoreSetup) {
      router.replace("/store/create");
    }
  }, [
    loading,
    isAuthenticated,
    needsStoreSetup,
    router,
  ]);

  /*
  |--------------------------------------------------------------------------
  | Product Actions
  |--------------------------------------------------------------------------
  */

  const toggleProductActive =
    async (
      productId: string,
      currentStatus: boolean
    ) => {
      try {
        await productService
          .updateAvailability(
            productId,
            !currentStatus
          );

        await refreshProducts();
      } catch (actionError) {
        console.error(
          "Error updating product availability:",
          actionError
        );

        alert(
          "Failed to update product availability"
        );
      }
    };

  const toggleProductFeatured =
    async (
      productId: string,
      currentStatus: boolean
    ) => {
      try {
        await productService
          .updateFeatured(
            productId,
            !currentStatus
          );

        await refreshProducts();
      } catch (actionError) {
        console.error(
          "Error updating featured status:",
          actionError
        );

        alert(
          "Failed to update featured status"
        );
      }
    };

  const deleteProduct =
    async (
      productId: string
    ) => {
      const confirmed =
        window.confirm(
          "Are you sure you want to delete this product? This action cannot be undone."
        );

      if (!confirmed) {
        return;
      }

      try {
        await productService
          .deleteProduct(
            productId
          );

        await refreshProducts();
      } catch (actionError) {
        console.error(
          "Error deleting product:",
          actionError
        );

        alert(
          "Failed to delete product"
        );
      }
    };

  const duplicateProduct =
    async (
      product: Product
    ) => {
      try {
        await productService
          .duplicateProduct(
            product
          );

        await refreshProducts();
      } catch (actionError) {
        console.error(
          "Error duplicating product:",
          actionError
        );

        alert(
          "Failed to duplicate product"
        );
      }
    };

  /*
  |--------------------------------------------------------------------------
  | Loading
  |--------------------------------------------------------------------------
  */

  if (loading) {
    return (
      <BrandedLoader
        message="Loading Products"
      />
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Redirect State
  |--------------------------------------------------------------------------
  */

  if (
    !isAuthenticated ||
    needsStoreSetup
  ) {
    return null;
  }

  /*
  |--------------------------------------------------------------------------
  | Error
  |--------------------------------------------------------------------------
  */

  if (error) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center">
        <AlertCircle className="mx-auto mb-4 h-16 w-16 text-gray-300" />

        <p className="text-lg text-gray-500">
          {error}
        </p>

        <button
          type="button"
          onClick={() =>
            refreshProducts()
          }
          className="mt-4 rounded-xl bg-orange-500 px-6 py-2 font-semibold text-white transition hover:bg-orange-600"
        >
          Try Again
        </button>
      </div>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Page
  |--------------------------------------------------------------------------
  */

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Products
          </h1>

          <p className="text-sm text-gray-500">
            Manage your store inventory
          </p>
        </div>

        <Link
          href="/store/products/add"
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:from-orange-600 hover:to-orange-700 hover:shadow-lg"
        >
          <Plus className="h-4 w-4" />
          Add Product
        </Link>
      </div>

      <ProductStats {...stats} />

      <ProductFilters
        searchQuery={searchQuery}
        onSearchChange={
          setSearchQuery
        }
        categoryFilter={
          categoryFilter
        }
        onCategoryChange={
          setCategoryFilter
        }
        statusFilter={
          statusFilter
        }
        onStatusChange={
          setStatusFilter
        }
      />

      {filteredProducts.length ===
      0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center">
          <Package className="mx-auto mb-4 h-16 w-16 text-gray-300" />

          <p className="text-lg font-medium text-gray-500">
            No products found
          </p>

          <p className="mt-1 text-sm text-gray-400">
            {hasFilters
              ? "Try adjusting your filters"
              : "Start adding products to your store"}
          </p>

          {hasFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 text-sm font-medium text-orange-600 hover:text-orange-700"
            >
              Clear all filters
            </button>
          ) : (
            <Link
              href="/store/products/add"
              className="mt-4 inline-block rounded-xl bg-orange-500 px-6 py-3 font-semibold text-white transition hover:bg-orange-600"
            >
              Add Your First Product
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              {filteredProducts.length}{" "}
              products
            </span>

            <span className="text-green-600">
              {
                filteredProducts.filter(
                  (product) =>
                    product.isAvailable
                ).length
              }{" "}
              active
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            <AnimatePresence
              initial={false}
              mode="popLayout"
            >
              {filteredProducts.map(
                (product) => (
                  <motion.div
                    key={product.id}
                    initial={{
                      opacity: 0,
                      scale: 0.95,
                    }}
                    animate={{
                      opacity: 1,
                      scale: 1,
                    }}
                    exit={{
                      opacity: 0,
                      scale: 0.9,
                    }}
                    transition={{
                      duration: 0.2,
                    }}
                  >
                    <ProductCard
                      product={product}
                      onToggleActive={
                        toggleProductActive
                      }
                      onToggleFeatured={
                        toggleProductFeatured
                      }
                      onDelete={
                        deleteProduct
                      }
                      onDuplicate={
                        duplicateProduct
                      }
                    />
                  </motion.div>
                )
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}
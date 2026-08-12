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

import {
  useStoreProductFilters,
} from "@/hooks/useStoreProductFilters";

import {
  useEffect,
  useMemo,
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
import {useProductCategories} from "@/hooks/useProductCategories";
import {categoryService} from "@/services/category/categoryService";
import {useStoreProductActions} from "@/hooks/useStoreProductActions";


export default function ProductsPage() {
  const router = useRouter();
  const categories = useProductCategories();

  const {
    products,
    loading,
    error,
    isAuthenticated,
    needsStoreSetup,
    refreshProducts,
  } = useStoreProducts();
  const {
    toggleProductActive,
    toggleProductFeatured,
    deleteProduct,
    duplicateProduct,
  } = useStoreProductActions(refreshProducts);

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
  const productGroups = useMemo(() =>
    categoryService.groupCategoriesWithProducts(categories, filteredProducts)
      .map((category) => ({
        ...category,
        products: [...category.products].sort((first, second) =>
          first.name.localeCompare(second.name, undefined, {sensitivity: "base"})
        ),
      }))
      .sort((first, second) => first.name.localeCompare(second.name, undefined, {sensitivity: "base"})),
  [categories, filteredProducts]);

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
      router.replace("/store/onboarding/owner");
    }
  }, [
    loading,
    isAuthenticated,
    needsStoreSetup,
    router,
  ]);

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

          <div className="space-y-7">
            {productGroups.map((category) => <section key={category.id} className="min-w-0 max-w-full">
              <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-2"><div><h2 className="text-base font-bold text-gray-800">{category.name}</h2><p className="mt-0.5 text-xs font-medium text-gray-400">{category.products.length} product{category.products.length === 1 ? "" : "s"}</p></div><Link href={`/store/products/category/${encodeURIComponent(category.id)}`} className="inline-flex items-center rounded-lg bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-700 ring-1 ring-orange-100 transition hover:bg-orange-100 hover:ring-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-400">View all →</Link></div>
              <div className="flex w-full max-w-full gap-3 overflow-x-auto overscroll-x-contain pb-3 scrollbar-hide"><AnimatePresence initial={false} mode="popLayout">
              {category.products.map((product) => (
                  <motion.div
                    key={product.id}
                    className="w-[150px] shrink-0 sm:w-[170px]"
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
                      categoryName={category.name}
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
              ))}
              </AnimatePresence></div>
            </section>)}
          </div>
        </>
      )}
    </div>
  );
}

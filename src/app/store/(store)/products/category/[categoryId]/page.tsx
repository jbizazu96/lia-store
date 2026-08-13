"use client";

import {use, useDeferredValue, useEffect, useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {ArrowLeft, PackageOpen, Search} from "lucide-react";
import {BrandedLoader} from "@/components/ui/BrandedLoader";
import {ProductCard} from "@/components/store/products/ProductCard";
import {useProductCategories} from "@/hooks/useProductCategories";
import {useStoreProductActions} from "@/hooks/useStoreProductActions";
import {useStoreProducts} from "@/hooks/useStoreProducts";

interface StoreCategoryProductsPageProps {
  params: Promise<{categoryId: string}>;
}

function decodeCategoryId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function StoreCategoryProductsPage({params}: StoreCategoryProductsPageProps) {
  const {categoryId: encodedCategoryId} = use(params);
  const categoryId = decodeCategoryId(encodedCategoryId);
  const router = useRouter();
  const categories = useProductCategories();
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<"name" | "stock_asc" | "stock_desc" | "price_asc" | "price_desc" | "updated_desc">("name");
  const deferredSearchValue = useDeferredValue(searchQuery.trim());
  const deferredSearch = deferredSearchValue.length >= 2 ? deferredSearchValue : "";
  const {
    products,
    filteredCount,
    loading,
    loadingMore,
    error,
    isAuthenticated,
    needsStoreSetup,
    hasMore,
    loadMore,
    refreshProducts,
  } = useStoreProducts({
    mode: "page",
    category: categoryId,
    search: deferredSearch,
    pageSize: 30,
    sort,
  });
  const actions = useStoreProductActions(refreshProducts);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) router.replace("/login");
    else if (needsStoreSetup) router.replace("/store/onboarding/owner");
  }, [isAuthenticated, loading, needsStoreSetup, router]);

  const category = categories.find((item) => item.id === categoryId);
  const categoryName = category?.name ?? products[0]?.category ?? "Category";

  if (loading) return <BrandedLoader message="Loading category products" />;
  if (!isAuthenticated || needsStoreSetup) return null;

  return <div className="space-y-6">
    <div>
      <Link href="/store/products" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition hover:text-orange-600">
        <ArrowLeft className="h-4 w-4" />Back to products
      </Link>
      <h1 className="text-2xl font-bold text-gray-800">{categoryName}</h1>
      <p className="mt-1 text-sm text-gray-500">{filteredCount} product{filteredCount === 1 ? "" : "s"}</p>
    </div>

    <label className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm focus-within:border-orange-300 focus-within:ring-2 focus-within:ring-orange-100">
      <Search className="h-5 w-5 shrink-0 text-gray-400" />
      <span className="sr-only">Search {categoryName}</span>
      <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={`Search within ${categoryName}`} className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400" />
    </label>
    <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm"><option value="name">Name A–Z</option><option value="stock_asc">Stock: Low first</option><option value="stock_desc">Stock: High first</option><option value="price_asc">Price: Low first</option><option value="price_desc">Price: High first</option><option value="updated_desc">Recently updated</option></select>

    {error ? (
      <section className="rounded-2xl border border-red-100 bg-red-50 p-8 text-center text-sm text-red-700">
        <p>{error}</p>
        <button type="button" onClick={() => void refreshProducts()} className="mt-4 rounded-xl bg-red-600 px-4 py-2 font-semibold text-white">Try again</button>
      </section>
    ) : products.length === 0 ? (
      <section className="rounded-2xl border border-gray-100 bg-white px-6 py-14 text-center">
        <PackageOpen className="mx-auto h-12 w-12 text-gray-300" />
        <h2 className="mt-4 font-bold text-gray-800">{deferredSearch ? "No matching products" : "No products in this category"}</h2>
        <p className="mt-2 text-sm text-gray-500">{deferredSearch ? "Try a different product name." : "Products assigned to this category will appear here."}</p>
      </section>
    ) : (
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {products.map((product) => <ProductCard
          key={product.id}
          product={product}
          categoryName={categoryName}
          onToggleActive={actions.toggleProductActive}
          onToggleFeatured={actions.toggleProductFeatured}
          onDelete={actions.deleteProduct}
          onDuplicate={actions.duplicateProduct}
          mutating={actions.isMutating(product.id)}
        />)}
      </div>
    )}
    {hasMore && <div className="flex justify-center"><button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{loadingMore ? "Loading…" : "Load more products"}</button></div>}
  </div>;
}

"use client";

import {use, useEffect, useMemo, useState} from "react";
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
  const {
    products,
    loading,
    error,
    isAuthenticated,
    needsStoreSetup,
    refreshProducts,
  } = useStoreProducts();
  const actions = useStoreProductActions(refreshProducts);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) router.replace("/login");
    else if (needsStoreSetup) router.replace("/store/onboarding/owner");
  }, [isAuthenticated, loading, needsStoreSetup, router]);

  const category = categories.find((item) => item.id === categoryId);
  const categoryProducts = useMemo(() => products
    .filter((product) => product.category.trim().toLowerCase() === categoryId.trim().toLowerCase())
    .sort((first, second) => first.name.localeCompare(second.name, undefined, {sensitivity: "base"})),
  [categoryId, products]);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const displayedProducts = useMemo(() => normalizedSearch
    ? categoryProducts.filter((product) => [product.name, product.description ?? ""]
      .join(" ").toLowerCase().includes(normalizedSearch))
    : categoryProducts,
  [categoryProducts, normalizedSearch]);
  const categoryName = category?.name ?? categoryProducts[0]?.category ?? "Category";

  if (loading) return <BrandedLoader message="Loading category products" />;
  if (!isAuthenticated || needsStoreSetup) return null;

  return <div className="space-y-6">
    <div>
      <Link href="/store/products" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-gray-500 transition hover:text-orange-600">
        <ArrowLeft className="h-4 w-4" />Back to products
      </Link>
      <h1 className="text-2xl font-bold text-gray-800">{categoryName}</h1>
      <p className="mt-1 text-sm text-gray-500">{categoryProducts.length} product{categoryProducts.length === 1 ? "" : "s"}</p>
    </div>

    <label className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm focus-within:border-orange-300 focus-within:ring-2 focus-within:ring-orange-100">
      <Search className="h-5 w-5 shrink-0 text-gray-400" />
      <span className="sr-only">Search {categoryName}</span>
      <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={`Search within ${categoryName}`} className="min-w-0 flex-1 bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400" />
    </label>

    {error ? (
      <section className="rounded-2xl border border-red-100 bg-red-50 p-8 text-center text-sm text-red-700">
        <p>{error}</p>
        <button type="button" onClick={() => void refreshProducts()} className="mt-4 rounded-xl bg-red-600 px-4 py-2 font-semibold text-white">Try again</button>
      </section>
    ) : displayedProducts.length === 0 ? (
      <section className="rounded-2xl border border-gray-100 bg-white px-6 py-14 text-center">
        <PackageOpen className="mx-auto h-12 w-12 text-gray-300" />
        <h2 className="mt-4 font-bold text-gray-800">{normalizedSearch ? "No matching products" : "No products in this category"}</h2>
        <p className="mt-2 text-sm text-gray-500">{normalizedSearch ? "Try a different product name." : "Products assigned to this category will appear here."}</p>
      </section>
    ) : (
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {displayedProducts.map((product) => <ProductCard
          key={product.id}
          product={product}
          categoryName={categoryName}
          onToggleActive={actions.toggleProductActive}
          onToggleFeatured={actions.toggleProductFeatured}
          onDelete={actions.deleteProduct}
          onDuplicate={actions.duplicateProduct}
        />)}
      </div>
    )}
  </div>;
}

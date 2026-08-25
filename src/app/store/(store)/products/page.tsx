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
  useEffect,
  useMemo,
  useRef,
  useState,
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
import {useStoreWorkspace} from "@/context/StoreWorkspaceContext";

import {
  ProductFilters,
} from "@/components/store/products/ProductFilters";

import {
  ProductStats,
} from "@/components/store/products/ProductStats";
import {useProductCategories} from "@/hooks/useProductCategories";
import {useStoreProductActions} from "@/hooks/useStoreProductActions";
import {productService} from "@/services/product/productService";
import {useDebouncedValue} from "@/hooks/useDebouncedValue";

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {value += '"'; index += 1;}
    else if (character === '"') quoted = !quoted;
    else if (character === "," && !quoted) {cells.push(value.trim()); value = "";}
    else value += character;
  }
  cells.push(value.trim());
  return cells;
}

export default function ProductsPage() {
  const {entry} = useStoreWorkspace();
  const readOnly = entry?.access.role === "staff" && entry.access.permissions.products === "read";
  const router = useRouter();
  const categories = useProductCategories();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive" | "out_of_stock" | "low_stock" | "image_issues">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [sort, setSort] = useState<"name" | "stock_asc" | "stock_desc" | "price_asc" | "price_desc" | "updated_desc">("name");
  const importInputRef = useRef<HTMLInputElement>(null);
  const [auditEntries, setAuditEntries] = useState<Array<{id: string; productName: string; action: string; createdAt: string}>>([]);
  const deferredSearchValue = useDebouncedValue(searchQuery.trim());
  const deferredSearch = deferredSearchValue.length >= 2 ? deferredSearchValue : "";
  const hasFilters = Boolean(deferredSearch) || categoryFilter !== "all" || statusFilter !== "all";

  const {
    products,
    categories: categoryRows,
    stats,
    filteredCount,
    filteredStats,
    loading,
    loadingMore,
    error,
    isAuthenticated,
    needsStoreSetup,
    hasMore,
    loadMore,
    refreshProducts,
  } = useStoreProducts(hasFilters ? {
    mode: "page",
    category: categoryFilter,
    status: statusFilter,
    search: deferredSearch,
    pageSize: 30,
    sort,
  } : {mode: "overview"});
  const {
    toggleProductActive,
    toggleProductFeatured,
    deleteProduct,
    duplicateProduct,
    isMutating,
  } = useStoreProductActions(refreshProducts);

  const productGroups = useMemo(() => hasFilters
    ? [{
        id: categoryFilter,
        name: categoryFilter === "all"
          ? "Search results"
          : categories.find((item) => item.id === categoryFilter)?.name ?? "Products",
        count: filteredCount,
        products,
      }]
    : categoryRows,
  [categories, categoryFilter, categoryRows, filteredCount, hasFilters, products]);
  const clearFilters = () => {
    setSearchQuery("");
    setCategoryFilter("all");
    setStatusFilter("all");
  };
  const bulkAvailability = async (isAvailable: boolean) => {
    if (selectedIds.size === 0 || bulkSaving) return;
    try {
      setBulkSaving(true);
      await productService.bulkUpdateAvailability([...selectedIds], isAvailable);
      setSelectedIds(new Set());
      await refreshProducts();
    } finally { setBulkSaving(false); }
  };
  const exportLoadedProducts = () => {
    const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const loaded = hasFilters ? products : categoryRows.flatMap((row) => row.products);
    const csv = [["Product ID", "Product", "SKU", "Category", "Price", "Stock", "Active", "Featured", "Image status"], ...loaded.map((product) => [product.id, product.name, product.sku, product.category, product.price, product.stock, product.isAvailable, product.featured, product.imageStatus ?? "none"])]
      .map((row) => row.map(quote).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"}));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  const importInventoryCsv = async (file: File) => {
    const lines = (await file.text()).split(/\r?\n/).filter(Boolean);
    const rows = lines.slice(1).map((line) => {
      const cells = parseCsvLine(line);
      return {productId: cells[0], price: cells[4] === "" ? undefined : Number(cells[4]), stock: cells[5] === "" ? undefined : Number(cells[5])};
    }).filter((row) => row.productId && Number.isFinite(row.price ?? 0) && Number.isFinite(row.stock ?? 0));
    if (rows.length === 0) {window.alert("No valid inventory rows were found."); return;}
    try {setBulkSaving(true); await productService.importInventory(rows); await refreshProducts(); window.alert(`${rows.length} products updated.`);} catch (error) {window.alert(error instanceof Error ? error.message : "Inventory import failed.");} finally {setBulkSaving(false); if (importInputRef.current) importInputRef.current.value = "";}
  };
  useEffect(() => {
    if (!loading && isAuthenticated && !needsStoreSetup) void productService.getStoreInventoryAudit(10).then(setAuditEntries).catch((auditError) => console.error("Unable to load inventory history:", auditError));
  }, [loading, isAuthenticated, needsStoreSetup, stats.totalStock]);

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

        {!readOnly && <Link
          href="/store/products/add"
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:from-orange-600 hover:to-orange-700 hover:shadow-lg"
        >
          <Plus className="h-4 w-4" />
          Add Product
        </Link>}
      </div>

      <ProductStats {...stats} />

      {readOnly && <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm font-semibold text-blue-800">Read-only product access. Contact the store owner to request editing permission.</div>}
      {!readOnly && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-white p-3 text-sm">
        <span className="mr-auto text-gray-500">{selectedIds.size} selected</span>
        <button type="button" disabled={selectedIds.size === 0 || bulkSaving} onClick={() => void bulkAvailability(true)} className="rounded-lg bg-green-50 px-3 py-2 font-semibold text-green-700 disabled:opacity-40">Activate</button>
        <button type="button" disabled={selectedIds.size === 0 || bulkSaving} onClick={() => void bulkAvailability(false)} className="rounded-lg bg-gray-100 px-3 py-2 font-semibold text-gray-700 disabled:opacity-40">Deactivate</button>
        <button type="button" onClick={exportLoadedProducts} className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700">Export loaded CSV</button>
        <input ref={importInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => {const file = event.target.files?.[0]; if (file) void importInventoryCsv(file);}} />
        <button type="button" disabled={bulkSaving} onClick={() => importInputRef.current?.click()} className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:opacity-40">Import inventory CSV</button>
      </div>}

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
        onStatusChange={(value) => setStatusFilter(value as typeof statusFilter)}
        sort={sort}
        onSortChange={(value) => setSort(value as typeof sort)}
      />

      {(hasFilters ? products.length === 0 : categoryRows.length === 0) ? (
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
          ) : readOnly ? null : (
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
              {hasFilters ? filteredCount : stats.totalProducts}{" "}products
            </span>

            <span className="text-green-600">
              {
                hasFilters ? filteredStats.active : stats.activeProducts
              }{" "}
              enabled
            </span>
          </div>

          <div className="space-y-7">
            {productGroups.map((category) => <section key={category.id} className="min-w-0 max-w-full">
              <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-2"><div><h2 className="text-base font-bold text-gray-800">{category.name}</h2><p className="mt-0.5 text-xs font-medium text-gray-400">{category.count} product{category.count === 1 ? "" : "s"}</p></div>{!hasFilters && <Link href={`/store/products/category/${encodeURIComponent(category.id)}`} className="inline-flex items-center rounded-lg bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-700 ring-1 ring-orange-100 transition hover:bg-orange-100 hover:ring-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-400">View all →</Link>}</div>
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
                      readOnly={readOnly}
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
                      mutating={isMutating(product.id)}
                      selected={selectedIds.has(product.id)}
                      onSelectionChange={(selected) => setSelectedIds((current) => {const next = new Set(current); if (selected) next.add(product.id); else next.delete(product.id); return next;})}
                    />
                  </motion.div>
              ))}
              </AnimatePresence></div>
            </section>)}
          </div>
          {hasFilters && hasMore && <div className="flex justify-center"><button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{loadingMore ? "Loading…" : "Load more"}</button></div>}
          {auditEntries.length > 0 && <details className="rounded-xl border border-gray-100 bg-white p-4"><summary className="cursor-pointer font-semibold text-gray-800">Recent inventory activity</summary><div className="mt-3 divide-y divide-gray-100">{auditEntries.map((entry) => <div key={entry.id} className="flex justify-between gap-4 py-2 text-xs"><span className="truncate text-gray-700">{entry.productName} · {entry.action.replaceAll("_", " ")}</span><time className="shrink-0 text-gray-400">{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "Pending"}</time></div>)}</div></details>}
        </>
      )}
    </div>
  );
}

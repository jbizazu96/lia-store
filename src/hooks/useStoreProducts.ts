"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {auth} from "@/lib/firebase";
import {useStoreWorkspace} from "@/context/StoreWorkspaceContext";
import {productService} from "@/services/product/productService";
import type {Product} from "@/types/product";

export interface StoreProductCategoryRow {
  id: string;
  name: string;
  count: number;
  products: Product[];
}

export interface StoreProductStats {
  totalProducts: number;
  activeProducts: number;
  featuredProducts: number;
  totalStock: number;
  totalValue: number;
  outOfStockProducts: number;
  imageIssueProducts: number;
}

interface UseStoreProductsOptions {
  mode?: "overview" | "page";
  category?: string;
  status?: "all" | "active" | "inactive" | "out_of_stock" | "low_stock" | "image_issues";
  search?: string;
  pageSize?: number;
  sort?: "name" | "stock_asc" | "stock_desc" | "price_asc" | "price_desc" | "updated_desc";
}

const emptyStats: StoreProductStats = {
  totalProducts: 0,
  activeProducts: 0,
  featuredProducts: 0,
  totalStock: 0,
  totalValue: 0,
  outOfStockProducts: 0,
  imageIssueProducts: 0,
};

export function useStoreProducts(options: UseStoreProductsOptions = {}) {
  const {entry, loading: workspaceLoading} = useStoreWorkspace();
  const mode = options.mode ?? "overview";
  const category = options.category ?? "all";
  const status = options.status ?? "all";
  const search = options.search?.trim() ?? "";
  const pageSize = options.pageSize ?? 25;
  const sort = options.sort ?? "name";
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<StoreProductCategoryRow[]>([]);
  const [stats, setStats] = useState<StoreProductStats>(emptyStats);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filteredCount, setFilteredCount] = useState(0);
  const [filteredStats, setFilteredStats] = useState({active: 0, outOfStock: 0, imageIssues: 0});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [needsStoreSetup, setNeedsStoreSetup] = useState(false);
  const requestId = useRef(0);
  const lastVisibleRefreshAt = useRef(0);

  const load = useCallback(async (cursor?: string, append = false, showLoading = true) => {
    const currentRequest = ++requestId.current;
    if (showLoading) setLoading(true);
    if (append) setLoadingMore(true);
    try {
      setError(null);
      const inventory = await productService.getOwnedStoreProducts({
        mode,
        category,
        status,
        search,
        pageSize,
        sort,
        ...(cursor ? {cursor} : {}),
      });
      if (currentRequest !== requestId.current) return;
      setStoreId(inventory.storeId);
      setProducts((current) => append ? [...current, ...inventory.products] : inventory.products);
      setCategories(inventory.categories);
      setStats(inventory.stats);
      setFilteredCount(inventory.filteredCount);
      setFilteredStats(inventory.filteredStats);
      setNextCursor(inventory.nextCursor);
      setNeedsStoreSetup(false);
    } catch (loadError) {
      if (currentRequest !== requestId.current) return;
      console.error("Error loading store products:", loadError);
      // Background synchronization must never replace a usable inventory with
      // an empty/error screen because of a temporary network failure.
      if (!append && showLoading) {
        setProducts([]);
        setCategories([]);
        setError("Failed to load products.");
      }
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [category, mode, pageSize, search, sort, status]);

  useEffect(() => {
    if (workspaceLoading) return;
    if (!auth.currentUser) {
      requestId.current += 1;
      queueMicrotask(() => {
        setProducts([]); setCategories([]); setStoreId(null); setIsAuthenticated(false);
        setError("You must sign in."); setLoading(false);
      });
      return;
    }
    if (!entry?.hasStore || !entry.store) {
      queueMicrotask(() => {setNeedsStoreSetup(true); setLoading(false);});
      return;
    }
    queueMicrotask(() => {setIsAuthenticated(true); void load();});
  }, [entry, load, workspaceLoading]);

  useEffect(() => {
    const refreshVisibleInventory = () => {
      if (document.visibilityState !== "visible" || !auth.currentUser) return;
      const now = Date.now();
      if (now - lastVisibleRefreshAt.current < 30_000) return;
      lastVisibleRefreshAt.current = now;
      void load(undefined, false, false);
    };
    document.addEventListener("visibilitychange", refreshVisibleInventory);
    window.addEventListener("lia:store-inventory-changed", refreshVisibleInventory);
    return () => {
      document.removeEventListener("visibilitychange", refreshVisibleInventory);
      window.removeEventListener("lia:store-inventory-changed", refreshVisibleInventory);
    };
  }, [load]);

  const refreshProducts = useCallback(() => load(undefined, false, false), [load]);
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    await load(nextCursor, true, false);
  }, [load, loadingMore, nextCursor]);

  return {
    products,
    categories,
    stats,
    filteredCount,
    filteredStats,
    storeId,
    loading,
    loadingMore,
    error,
    isAuthenticated,
    needsStoreSetup,
    hasMore: nextCursor !== null,
    loadMore,
    refreshProducts,
  };
}

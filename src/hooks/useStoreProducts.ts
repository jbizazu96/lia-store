"use client";

/*
|--------------------------------------------------------------------------
| useStoreProducts Hook
|--------------------------------------------------------------------------
|
| Connects the product service to the store products page.
|
| Responsibilities:
| - Wait for authentication.
| - Resolve the signed-in user's store.
| - Load the store's products.
| - Expose loading, error, and refresh state.
|
| Product writes remain in productService.
|
*/

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  onAuthStateChanged,
} from "firebase/auth";

import {
  auth,
} from "@/lib/firebase";

import {
  productService,
} from "@/services/product/productService";

import type {
  Product,
} from "@/types/product";

interface UseStoreProductsResult {
  products: Product[];

  storeId: string | null;

  loading: boolean;

  error: string | null;

  isAuthenticated: boolean;

  needsStoreSetup: boolean;

  refreshProducts: () => Promise<void>;
}

export function useStoreProducts():
UseStoreProductsResult {
  const [
    products,
    setProducts,
  ] = useState<Product[]>([]);

  const [
    storeId,
    setStoreId,
  ] = useState<string | null>(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  const [
    isAuthenticated,
    setIsAuthenticated,
  ] = useState(false);

  const [
    needsStoreSetup,
    setNeedsStoreSetup,
  ] = useState(false);

  const loadProducts =
    useCallback(
      async (
        resolvedStoreId: string,
        showLoading = true
      ): Promise<void> => {
        if (showLoading) {
          setLoading(true);
        }

        try {
          setError(null);

          const ownedInventory =
            await productService
              .getOwnedStoreProducts();

          if (
            ownedInventory.storeId !==
            resolvedStoreId
          ) {
            throw new Error(
              "The store inventory could not be verified."
            );
          }

          setProducts(
            ownedInventory.products
          );
        } catch (loadError) {
          console.error(
            "Error loading store products:",
            loadError
          );

          setProducts([]);

          setError(
            "Failed to load products."
          );
        } finally {
          if (showLoading) {
            setLoading(false);
          }
        }
      },
      []
    );

  useEffect(() => {
    let refreshTimer: ReturnType<
      typeof setInterval
    > | null = null;

    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (user) => {
          if (!user) {
            setProducts([]);
            setStoreId(null);
            setIsAuthenticated(false);
            setNeedsStoreSetup(false);
            setError(
              "You must sign in."
            );
            setLoading(false);

            return;
          }

          setIsAuthenticated(true);
          setNeedsStoreSetup(false);
          setLoading(true);
          setError(null);

          try {
            const ownedInventory =
              await productService
                .getOwnedStoreProducts();

            if (!ownedInventory.storeId) {
              setProducts([]);
              setStoreId(null);
              setNeedsStoreSetup(true);

              setError(
                "No store was found for this account."
              );

              setLoading(false);

              return;
            }

            setStoreId(
              ownedInventory.storeId
            );

            setProducts(
              ownedInventory.products
            );

            setError(null);
            setLoading(false);

            /*
             * Inventory is private callable data. A bounded refresh keeps
             * image-processing state current without maintaining a full
             * Firestore collection listener for every open store tab.
             */
            refreshTimer = setInterval(
              () => {
                void loadProducts(
                  ownedInventory.storeId,
                  false
                );
              },
              30_000
            );
          } catch (loadError) {
            console.error(
              "Error preparing store products:",
              loadError
            );

            setProducts([]);
            setStoreId(null);

            setError(
              "Failed to load products."
            );

            setLoading(false);
          }
        }
      );

    return () => {
      unsubscribe();

      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
    };
  }, [loadProducts]);

  const refreshProducts =
    useCallback(async (): Promise<void> => {
      if (!storeId) {
        return;
      }

      await loadProducts(
        storeId,
        false
      );
    }, [
      loadProducts,
      storeId,
    ]);

  return {
    products,
    storeId,
    loading,
    error,
    isAuthenticated,
    needsStoreSetup,
    refreshProducts,
  };
}

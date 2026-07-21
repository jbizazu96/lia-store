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

import {
  userService,
} from "@/services/user/userService";

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

          const loadedProducts =
            await productService
              .getStoreProducts(
                resolvedStoreId
              );

          setProducts(
            loadedProducts
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
            const resolvedStoreId =
              await userService.getStoreId(
                user.uid
              );

            if (!resolvedStoreId) {
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
              resolvedStoreId
            );

            await loadProducts(
              resolvedStoreId
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

    return unsubscribe;
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
"use client";

/*
|--------------------------------------------------------------------------
| useStoreInfo Hook
|--------------------------------------------------------------------------
|
| Loads and prepares the data required by the customer store info page.
|
| Responsibilities:
| - Load the store domain model through storeService.
| - Convert it into the CustomerStore view model.
| - Manage loading and error state.
|
| The page should only handle rendering and navigation.
|
*/

import {
  useEffect,
  useState,
} from "react";

import { storeMapper } from "@/mappers/storeMapper";
import { storeService } from "@/services/store/storeService";

import type { CustomerStore } from "@/types/view-models/customerStore";

/*
|--------------------------------------------------------------------------
| Hook Parameters
|--------------------------------------------------------------------------
*/

interface UseStoreInfoParams {
  storeId: string;
}

/*
|--------------------------------------------------------------------------
| Hook Result
|--------------------------------------------------------------------------
*/

interface UseStoreInfoResult {
  store: CustomerStore | null;

  loading: boolean;

  error: string | null;
}

/*
|--------------------------------------------------------------------------
| Hook
|--------------------------------------------------------------------------
*/

export function useStoreInfo({
  storeId,
}: UseStoreInfoParams): UseStoreInfoResult {
  const [
    store,
    setStore,
  ] = useState<CustomerStore | null>(
    null
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadStoreInfo = async () => {
      try {
        setLoading(true);
        setError(null);

        const domainStore =
          await storeService.getStore(
            storeId
          );

        if (!domainStore) {
          if (isMounted) {
            setStore(null);

            setError(
              "Store not found"
            );
          }

          return;
        }

        const customerStore =
          storeMapper.toCustomerStore(
            domainStore
          );

        if (!isMounted) {
          return;
        }

        setStore(customerStore);
      } catch (loadError) {
        console.error(
          "Error loading store information:",
          loadError
        );

        if (isMounted) {
          setStore(null);

          setError(
            "Failed to load store information"
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadStoreInfo();

    return () => {
      isMounted = false;
    };
  }, [storeId]);

  return {
    store,
    loading,
    error,
  };
}
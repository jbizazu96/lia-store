"use client";

/*
|--------------------------------------------------------------------------
| useCartStoreStatus Hook
|--------------------------------------------------------------------------
|
| Loads the store represented by the current cart and determines whether
| it is currently open using the centralized store schedule service.
|
| This hook is read-only.
|
*/

import {
  useEffect,
  useState,
} from "react";

import type {
  Store,
} from "@/types/store";

import {
  storeService,
} from "@/services/store/storeService";

import {
  getStoreStatus,
} from "@/services/store/storeSchedule";

/*
|--------------------------------------------------------------------------
| Hook Parameters
|--------------------------------------------------------------------------
*/

interface UseCartStoreStatusParams {
  storeId: string | undefined;
}

/*
|--------------------------------------------------------------------------
| Hook Result
|--------------------------------------------------------------------------
*/

interface UseCartStoreStatusResult {
  loading: boolean;

  store: Store | null;

  isOpen: boolean;

  error: string | null;
}

/*
|--------------------------------------------------------------------------
| Hook
|--------------------------------------------------------------------------
*/

export function useCartStoreStatus({
  storeId,
}: UseCartStoreStatusParams): UseCartStoreStatusResult {
  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    store,
    setStore,
  ] = useState<Store | null>(
    null
  );

  const [
    isOpen,
    setIsOpen,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null
  );

  useEffect(() => {
    async function loadStore() {
      if (!storeId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const loadedStore =
          await storeService.getStore(
            storeId
          );

        if (!loadedStore) {
          setError(
            "Unable to load store."
          );

          setLoading(false);

          return;
        }

        setStore(loadedStore);

        const status =
          getStoreStatus(
            loadedStore.schedule,
            loadedStore.isOpen
          );

        setIsOpen(
          status.isOpen
        );
      } catch (err) {
        console.error(
          "Error loading cart store:",
          err
        );

        setError(
          "Unable to determine store availability."
        );
      } finally {
        setLoading(false);
      }
    }

    loadStore();
  }, [storeId]);

  return {
    loading,
    store,
    isOpen,
    error,
  };
}
/*
|--------------------------------------------------------------------------
| Customer Saved Stores Hook
|--------------------------------------------------------------------------
|
| Maintains a small optimistic view of the customer's saved stores while the
| callable remains the source of truth. Failed changes are rolled back.
|
*/

"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  customerFavoriteStoreClientService,
} from "@/services/store/customerFavoriteStoreClientService";

export function useCustomerFavoriteStores() {
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void customerFavoriteStoreClientService
      .get()
      .then(({ storeIds: ids }) => {
        if (active) {
          setStoreIds(ids);
        }
      })
      .catch((error) => {
        console.error("Unable to load saved stores:", error);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const setFavorite = useCallback(
    async (
      storeId: string,
      isFavorite: boolean
    ) => {
      const previousStoreIds = storeIds;
      const nextStoreIds = isFavorite
        ? [...new Set([...previousStoreIds, storeId])]
        : previousStoreIds.filter((id) => id !== storeId);

      setStoreIds(nextStoreIds);

      try {
        const result = await customerFavoriteStoreClientService.set(
          storeId,
          isFavorite
        );

        setStoreIds(result.storeIds);
      } catch (error) {
        setStoreIds(previousStoreIds);
        throw error;
      }
    },
    [storeIds]
  );

  return {
    storeIds,
    loading,
    isFavorite: (storeId: string) => storeIds.includes(storeId),
    setFavorite,
  };
}

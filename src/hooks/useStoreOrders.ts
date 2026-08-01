"use client";

/*
|--------------------------------------------------------------------------
| useStoreOrders Hook
|--------------------------------------------------------------------------
|
| Store orders are fetched through callable Functions. A short bounded poll
| keeps Shipday status changes visible without leaving a browser listener on
| the entire private order history.
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
  mapFirestoreOrder,
} from "@/mappers/orderMapper";
import {
  storeWorkspaceClientService,
} from "@/services/store/storeWorkspaceClientService";
import type {
  Order,
} from "@/types/order";

interface UseStoreOrdersResult {
  orders: Order[];
  storeId: string | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  needsStoreSetup: boolean;
}

function mapOrder(
  value: Record<string, unknown> & { id: string },
): Order {
  return mapFirestoreOrder({
    id: value.id,
    data: () => value,
  } as never);
}

export function useStoreOrders(): UseStoreOrdersResult {
  const [orders, setOrders] = useState<Order[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [needsStoreSetup, setNeedsStoreSetup] = useState(false);

  const loadOrders = useCallback(async (
    showLoading = true,
    synchronize = false,
  ): Promise<void> => {
    if (showLoading) setLoading(true);

    try {
      const entry = await storeWorkspaceClientService.getEntry();
      if (!entry.hasStore || !entry.store) {
        setStoreId(null);
        setOrders([]);
        setNeedsStoreSetup(true);
        setError("No store was found for this account.");
        return;
      }

      setStoreId(entry.store.id);
      setNeedsStoreSetup(false);

      /* The scheduler owns ongoing Shipday sync; opening Orders gets one refresh. */
      if (synchronize) {
        try {
          const { getFunctions, httpsCallable } = await import("firebase/functions");
          await httpsCallable(getFunctions(undefined, "us-central1"), "syncStoreOrders")();
        } catch (syncError) {
          console.error("Store order synchronization failed:", syncError);
        }
      }

      const response = await storeWorkspaceClientService.getOrders();
      setOrders(response.orders.map(mapOrder));
      setError(null);
    } catch (loadError) {
      console.error("Error loading store orders:", loadError);
      setOrders([]);
      setError("Failed to load store orders.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setOrders([]);
        setStoreId(null);
        setIsAuthenticated(false);
        setNeedsStoreSetup(false);
        setError("You must sign in.");
        setLoading(false);
        return;
      }

      setIsAuthenticated(true);
      void loadOrders(true, true);
      refreshTimer = setInterval(() => void loadOrders(false), 30_000);
    });

    return () => {
      unsubscribe();
      if (refreshTimer) clearInterval(refreshTimer);
    };
  }, [loadOrders]);

  return {
    orders,
    storeId,
    loading,
    error,
    isAuthenticated,
    needsStoreSetup,
  };
}

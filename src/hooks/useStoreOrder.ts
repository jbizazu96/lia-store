"use client";

/*
|--------------------------------------------------------------------------
| useStoreOrder Hook
|--------------------------------------------------------------------------
|
| The open order page follows one paid, confirmed store order in real time.
| Security rules verify the current user owns its store. Private store and
| customer profile records are still obtained only through callable APIs.
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
import {auth} from "@/lib/firebase";
import {
  mapOrderData,
} from "@/mappers/orderMapper";
import {storeWorkspaceClientService} from "@/services/store/storeWorkspaceClientService";
import type {
  Order,
} from "@/types/order";

interface UseStoreOrderParams {
  orderId: string;
}

interface UseStoreOrderResult {
  order: Order | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  refreshOrder: () => Promise<void>;
}

export function useStoreOrder({ orderId }: UseStoreOrderParams): UseStoreOrderResult {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const loadOrder = useCallback(async (preserveCurrentOnError: boolean): Promise<void> => {
    if (!auth.currentUser || !orderId.trim()) return;

    try {
      const response = await storeWorkspaceClientService.getOrder(orderId);
      setOrder(mapOrderData(response.order.id, response.order));
      setError(null);
    } catch (loadError) {
      console.error("Error refreshing store order:", loadError);
      if (!preserveCurrentOnError) {
        setOrder(null);
        setError(loadError instanceof Error ? loadError.message : "The order could not be loaded.");
      }
    }
  }, [orderId]);

  const refreshOrder = useCallback(
    (): Promise<void> => loadOrder(true),
    [loadOrder],
  );

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(Boolean(user));

      if (!user) {
        setOrder(null);
        setError("You must sign in.");
        setLoading(false);
        return;
      }

      if (!orderId.trim()) {
        setOrder(null);
        setError("Order not found.");
        setLoading(false);
        return;
      }

      setLoading(true);
      void loadOrder(false).finally(() => setLoading(false));
    });

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible" && auth.currentUser) void refreshOrder();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      unsubscribeAuth();
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [loadOrder, orderId, refreshOrder]);

  return {
    order,
    loading,
    error,
    isAuthenticated,
    refreshOrder,
  };
}

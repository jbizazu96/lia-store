"use client";

/*
|--------------------------------------------------------------------------
| useStoreOrder Hook
|--------------------------------------------------------------------------
|
| A callable verifies the authenticated owner and confirmed-payment state
| before returning a private order. Polling is intentionally limited to the
| open detail page, avoiding a direct browser order listener.
|
*/

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  onAuthStateChanged,
  type User,
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

function mapOrder(value: Record<string, unknown> & { id: string }): Order {
  return mapFirestoreOrder({ id: value.id, data: () => value } as never);
}

export function useStoreOrder({ orderId }: UseStoreOrderParams): UseStoreOrderResult {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const loadOrder = useCallback(async (showLoading = true): Promise<void> => {
    if (!currentUser || !orderId.trim()) return;
    if (showLoading) setLoading(true);

    try {
      const response = await storeWorkspaceClientService.getOrder(orderId);
      setOrder(mapOrder(response.order));
      setError(null);
    } catch (loadError) {
      console.error("Error loading store order:", loadError);
      setOrder(null);
      setError("Order not found.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [currentUser, orderId]);

  useEffect(() => onAuthStateChanged(auth, (user) => {
    setCurrentUser(user);
    setIsAuthenticated(Boolean(user));

    if (!user) {
      setOrder(null);
      setError("You must sign in.");
      setLoading(false);
    }
  }), []);

  useEffect(() => {
    if (!currentUser) return;
    void loadOrder();
    const refreshTimer = setInterval(() => void loadOrder(false), 20_000);
    return () => clearInterval(refreshTimer);
  }, [currentUser, loadOrder]);

  return {
    order,
    loading,
    error,
    isAuthenticated,
    refreshOrder: () => loadOrder(false),
  };
}

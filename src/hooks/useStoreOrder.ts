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
import {
  doc,
  getDoc,
  onSnapshot,
} from "firebase/firestore";
import {
  auth,
  db,
} from "@/lib/firebase";
import {
  mapFirestoreOrder,
} from "@/mappers/orderMapper";
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

  const refreshOrder = useCallback(async (): Promise<void> => {
    if (!auth.currentUser || !orderId.trim()) return;

    try {
      const snapshot = await getDoc(doc(db, "orders", orderId));
      if (!snapshot.exists()) {
        setOrder(null);
        setError("Order not found.");
        return;
      }

      setOrder(mapFirestoreOrder(snapshot));
      setError(null);
    } catch (loadError) {
      console.error("Error refreshing store order:", loadError);
      setOrder(null);
      setError("Order not found.");
    }
  }, [orderId]);

  useEffect(() => {
    let unsubscribeOrder: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeOrder?.();
      unsubscribeOrder = null;
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
      unsubscribeOrder = onSnapshot(
        doc(db, "orders", orderId),
        (snapshot) => {
          if (!snapshot.exists()) {
            setOrder(null);
            setError("Order not found.");
          } else {
            setOrder(mapFirestoreOrder(snapshot));
            setError(null);
          }
          setLoading(false);
        },
        (listenerError) => {
          console.error("Error listening to store order:", listenerError);
          setOrder(null);
          setError("Order not found.");
          setLoading(false);
        },
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeOrder?.();
    };
  }, [orderId]);

  return {
    order,
    loading,
    error,
    isAuthenticated,
    refreshOrder,
  };
}

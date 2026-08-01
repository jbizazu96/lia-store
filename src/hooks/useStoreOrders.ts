"use client";

/*
|--------------------------------------------------------------------------
| useStoreOrders Hook
|--------------------------------------------------------------------------
|
| Fulfilment order status is operational data, so a store owner receives it
| through one narrowly scoped Firestore listener. The rules independently
| require ownership plus a paid, confirmed checkout. Store profile, Stripe,
| earnings, and other private workspace data remain callable-only.
|
*/

import {
  useEffect,
  useState,
} from "react";
import {
  onAuthStateChanged,
} from "firebase/auth";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import {
  auth,
  db,
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

export function useStoreOrders(): UseStoreOrdersResult {
  const [orders, setOrders] = useState<Order[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [needsStoreSetup, setNeedsStoreSetup] = useState(false);

  useEffect(() => {
    let unsubscribeOrders: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeOrders?.();
      unsubscribeOrders = null;

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
      setLoading(true);

      void storeWorkspaceClientService.getEntry()
        .then((entry) => {
          if (!entry.hasStore || !entry.store) {
            setStoreId(null);
            setOrders([]);
            setNeedsStoreSetup(true);
            setError("No store was found for this account.");
            return;
          }

          const ownedStoreId = entry.store.id;
          setStoreId(ownedStoreId);
          setNeedsStoreSetup(false);

          /*
           * The query constraints intentionally match the read rule. Do not
           * loosen these fields: Firestore rejects queries that might return
           * an unpaid order, and the UI must never display one.
           */
          const ordersQuery = query(
            collection(db, "orders"),
            where("store.id", "==", ownedStoreId),
            where("checkoutStatus", "==", "confirmed"),
            where("payment.status", "==", "paid"),
            orderBy("createdAt", "desc"),
          );

          unsubscribeOrders = onSnapshot(
            ordersQuery,
            (snapshot) => {
              setOrders(snapshot.docs.map((document) =>
                mapFirestoreOrder(document),
              ));
              setError(null);
              setLoading(false);
            },
            (listenerError) => {
              console.error("Error listening to store orders:", listenerError);
              setOrders([]);
              setError("Failed to load store orders.");
              setLoading(false);
            },
          );
        })
        .catch((loadError) => {
          console.error("Error loading store order access:", loadError);
          setOrders([]);
          setError("Failed to load store orders.");
          setLoading(false);
        });
    });

    return () => {
      unsubscribeAuth();
      unsubscribeOrders?.();
    };
  }, []);

  return {
    orders,
    storeId,
    loading,
    error,
    isAuthenticated,
    needsStoreSetup,
  };
}

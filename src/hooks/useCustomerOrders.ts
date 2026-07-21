"use client";

/*
|--------------------------------------------------------------------------
| useCustomerOrders Hook
|--------------------------------------------------------------------------
|
| Loads the signed-in customer's orders in real time.
|
| Responsibilities:
| - Wait for Firebase Authentication.
| - Subscribe to the customer's orders.
| - Convert Firestore documents into Order models.
| - Handle loading and authentication state.
| - Clean up listeners correctly.
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

import type {
  Order,
} from "@/types/order";

interface UseCustomerOrdersResult {
  orders: Order[];

  loading: boolean;

  error: string | null;

  isAuthenticated: boolean;
}

export function useCustomerOrders():
UseCustomerOrdersResult {

  const [
    orders,
    setOrders,
  ] = useState<Order[]>([]);

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

  useEffect(() => {
    let unsubscribeOrders:
      | (() => void)
      | null = null;

    const unsubscribeAuth =
      onAuthStateChanged(
        auth,
        (user) => {

          if (unsubscribeOrders) {
            unsubscribeOrders();
            unsubscribeOrders = null;
          }

          if (!user) {
            setOrders([]);
            setLoading(false);
            setIsAuthenticated(false);
            setError(
              "You must sign in."
            );
            return;
          }

          setIsAuthenticated(true);
          setLoading(true);
          setError(null);

          const ordersQuery =
            query(
              collection(
                db,
                "orders"
              ),
              where(
                "customer.uid",
                "==",
                user.uid
              ),
              orderBy(
                "createdAt",
                "desc"
              )
            );

          unsubscribeOrders =
            onSnapshot(
              ordersQuery,

              (snapshot) => {
                try {
                  const mappedOrders =
                    snapshot.docs.map(
                      mapFirestoreOrder
                    );

                  setOrders(
                    mappedOrders
                  );

                  setLoading(false);
                } catch (err) {
                  console.error(
                    err
                  );

                  setOrders([]);

                  setError(
                    "Failed to read orders."
                  );

                  setLoading(false);
                }
              },

              (listenerError) => {
                console.error(
                  listenerError
                );

                setOrders([]);

                setError(
                  "Failed to load orders."
                );

                setLoading(false);
              }
            );
        }
      );

    return () => {
      unsubscribeAuth();

      if (
        unsubscribeOrders
      ) {
        unsubscribeOrders();
      }
    };
  }, []);

  return {
    orders,
    loading,
    error,
    isAuthenticated,
  };
}
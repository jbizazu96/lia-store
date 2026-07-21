"use client";

/*
|--------------------------------------------------------------------------
| useCustomerOrder Hook
|--------------------------------------------------------------------------
|
| Loads one customer order in real time.
|
| Responsibilities:
| - Wait for Firebase Authentication to resolve.
| - Redirect unauthenticated customers through an error state.
| - Subscribe to the Firestore order document.
| - Convert Firestore data into the shared Order domain model.
| - Verify that the signed-in customer owns the order.
| - Clean up both Firebase listeners correctly.
|
| The order-detail page should only render the result.
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
  doc,
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

/*
|--------------------------------------------------------------------------
| Hook Parameters
|--------------------------------------------------------------------------
*/

interface UseCustomerOrderParams {
  orderId: string;
}

/*
|--------------------------------------------------------------------------
| Hook Result
|--------------------------------------------------------------------------
*/

interface UseCustomerOrderResult {
  order: Order | null;

  loading: boolean;

  error: string | null;

  isAuthenticated: boolean;
}

/*
|--------------------------------------------------------------------------
| Hook
|--------------------------------------------------------------------------
*/

export function useCustomerOrder({
  orderId,
}: UseCustomerOrderParams): UseCustomerOrderResult {
  const [
    order,
    setOrder,
  ] = useState<Order | null>(null);

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
    /*
    |--------------------------------------------------------------------------
    | Order Listener Cleanup
    |--------------------------------------------------------------------------
    |
    | This variable stores the active Firestore unsubscribe function.
    | It allows us to stop the listener when:
    | - The customer signs out.
    | - The order ID changes.
    | - The component unmounts.
    |
    */

    let unsubscribeFromOrder:
      | (() => void)
      | null = null;

    /*
    |--------------------------------------------------------------------------
    | Authentication Listener
    |--------------------------------------------------------------------------
    |
    | auth.currentUser may temporarily be null while Firebase restores the
    | session. onAuthStateChanged waits for the real authentication state.
    |
    */

    const unsubscribeFromAuth =
      onAuthStateChanged(
        auth,
        (user) => {
          /*
           * Stop any previous order subscription before creating another.
           */

          if (unsubscribeFromOrder) {
            unsubscribeFromOrder();
            unsubscribeFromOrder = null;
          }

          /*
           * Customer is not signed in.
           */

          if (!user) {
            setOrder(null);
            setError(
              "You must sign in to view this order."
            );
            setIsAuthenticated(false);
            setLoading(false);

            return;
          }

          setIsAuthenticated(true);
          setLoading(true);
          setError(null);

          /*
          |--------------------------------------------------------------------------
          | Real-Time Order Subscription
          |--------------------------------------------------------------------------
          */

          const orderReference = doc(
            db,
            "orders",
            orderId
          );

          unsubscribeFromOrder =
            onSnapshot(
              orderReference,

              (orderSnapshot) => {
                /*
                 * The requested order does not exist.
                 */

                if (
                  !orderSnapshot.exists()
                ) {
                  setOrder(null);
                  setError(
                    "Order not found."
                  );
                  setLoading(false);

                  return;
                }

                try {
                  /*
                   * Convert Firestore fields into the shared Order model.
                   */

                  const mappedOrder =
                    mapFirestoreOrder(
                      orderSnapshot
                    );

                  /*
                   * Customers may only view their own orders.
                   */

                  if (
                    mappedOrder.customer.uid !==
                    user.uid
                  ) {
                    setOrder(null);
                    setError(
                      "You do not have permission to view this order."
                    );
                    setLoading(false);

                    return;
                  }

                  setOrder(mappedOrder);
                  setError(null);
                  setLoading(false);
                } catch (
                  mappingError
                ) {
                  console.error(
                    "Error mapping customer order:",
                    mappingError
                  );

                  setOrder(null);
                  setError(
                    "The order data could not be read."
                  );
                  setLoading(false);
                }
              },

              (listenerError) => {
                console.error(
                  "Error listening to customer order:",
                  listenerError
                );

                setOrder(null);
                setError(
                  "Failed to load order."
                );
                setLoading(false);
              }
            );
        }
      );

    /*
    |--------------------------------------------------------------------------
    | Effect Cleanup
    |--------------------------------------------------------------------------
    */

    return () => {
      unsubscribeFromAuth();

      if (unsubscribeFromOrder) {
        unsubscribeFromOrder();
      }
    };
  }, [orderId]);

  return {
    order,
    loading,
    error,
    isAuthenticated,
  };
}
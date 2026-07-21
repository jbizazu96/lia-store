"use client";

/*
|--------------------------------------------------------------------------
| useStoreOrder Hook
|--------------------------------------------------------------------------
|
| Loads a single store order after verifying:
|
| - The user is authenticated.
| - The user owns a store.
| - The order belongs to that store.
|
| The hook also exposes refreshOrder so the page can reload the order after
| a status update.
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
} from "firebase/firestore";

import {
  auth,
  db,
} from "@/lib/firebase";

import {
  orderService,
} from "@/services/order/orderService";

import type {
  User,
} from "firebase/auth";

import type {
  Order,
} from "@/types/order";

/*
|--------------------------------------------------------------------------
| Hook Parameters
|--------------------------------------------------------------------------
*/

interface UseStoreOrderParams {
  orderId: string;
}

/*
|--------------------------------------------------------------------------
| Hook Result
|--------------------------------------------------------------------------
*/

interface UseStoreOrderResult {
  order: Order | null;

  loading: boolean;

  error: string | null;

  isAuthenticated: boolean;

  refreshOrder: () => Promise<void>;
}

/*
|--------------------------------------------------------------------------
| Hook
|--------------------------------------------------------------------------
*/

export function useStoreOrder({
  orderId,
}: UseStoreOrderParams): UseStoreOrderResult {
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

  const [
    currentUser,
    setCurrentUser,
  ] = useState<User | null>(null);

  /*
  |--------------------------------------------------------------------------
  | Load And Verify Order
  |--------------------------------------------------------------------------
  */

  const loadOrder = useCallback(
    async (
      user: User,
      showLoading = true
    ): Promise<void> => {
      if (showLoading) {
        setLoading(true);
      }

      try {
        setError(null);

        /*
        |--------------------------------------------------------------------------
        | Load Store ID
        |--------------------------------------------------------------------------
        */

        const userSnapshot =
          await getDoc(
            doc(
              db,
              "users",
              user.uid
            )
          );

        if (!userSnapshot.exists()) {
          setOrder(null);

          setError(
            "Store account not found."
          );

          return;
        }

        const storeId =
          userSnapshot.data().storeId;

        if (
          typeof storeId !== "string" ||
          !storeId.trim()
        ) {
          setOrder(null);

          setError(
            "Store not found."
          );

          return;
        }

        /*
        |--------------------------------------------------------------------------
        | Load Order
        |--------------------------------------------------------------------------
        */

        const loadedOrder =
          await orderService.getOrder(
            orderId
          );

        if (!loadedOrder) {
          setOrder(null);

          setError(
            "Order not found."
          );

          return;
        }

        /*
        |--------------------------------------------------------------------------
        | Verify Store Ownership
        |--------------------------------------------------------------------------
        */

        if (
          loadedOrder.store.id !==
          storeId
        ) {
          setOrder(null);

          setError(
            "You do not have permission to view this order."
          );

          return;
        }

        setOrder(loadedOrder);
        setError(null);
      } catch (loadError) {
        console.error(
          "Error loading store order:",
          loadError
        );

        setOrder(null);

        setError(
          "Failed to load order."
        );
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [orderId]
  );

  /*
  |--------------------------------------------------------------------------
  | Authentication
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        (user) => {
          setCurrentUser(user);

          if (!user) {
            setOrder(null);
            setLoading(false);
            setIsAuthenticated(false);

            setError(
              "You must sign in."
            );

            return;
          }

          setIsAuthenticated(true);

          void loadOrder(user);
        }
      );

    return unsubscribe;
  }, [loadOrder]);

  /*
  |--------------------------------------------------------------------------
  | Refresh Order
  |--------------------------------------------------------------------------
  |
  | Reloads the order without replacing the page with the loading screen.
  |
  */

  const refreshOrder =
    useCallback(async (): Promise<void> => {
      if (!currentUser) {
        return;
      }

      await loadOrder(
        currentUser,
        false
      );
    }, [
      currentUser,
      loadOrder,
    ]);

  return {
    order,
    loading,
    error,
    isAuthenticated,
    refreshOrder,
  };
}
"use client";

/*
|--------------------------------------------------------------------------
| useStoreOrders Hook
|--------------------------------------------------------------------------
|
| Loads the signed-in store owner's orders in real time.
|
| Responsibilities:
| - Wait for Firebase Authentication.
| - Resolve the owner's store ID.
| - Synchronize active delivery statuses.
| - Subscribe to the store's orders.
| - Convert Firestore documents into Order models.
| - Clean up authentication and Firestore listeners correctly.
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
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import {
  getFunctions,
  httpsCallable,
} from "firebase/functions";

import {
  auth,
  db,
} from "@/lib/firebase";

import {
  mapFirestoreOrder,
} from "@/mappers/orderMapper";

import {
  userService,
} from "@/services/user/userService";

import type {
  Order,
} from "@/types/order";

/*
|--------------------------------------------------------------------------
| Hook Result
|--------------------------------------------------------------------------
*/

interface UseStoreOrdersResult {
  orders: Order[];

  storeId: string | null;

  loading: boolean;

  error: string | null;

  isAuthenticated: boolean;

  needsStoreSetup: boolean;
}

/*
|--------------------------------------------------------------------------
| Find Store ID
|--------------------------------------------------------------------------
|
| First checks users/{uid}.storeId.
|
| The fallback query supports older accounts where the relationship is only
| stored on stores/{storeId}.ownerId.
|
*/

async function resolveStoreId(
  userId: string
): Promise<string | null> {
  const userStoreId =
    await userService.getStoreId(
      userId
    );

  if (userStoreId) {
    return userStoreId;
  }

  const storeQuery = query(
    collection(db, "stores"),
    where("ownerId", "==", userId)
  );

  const storeSnapshot =
    await getDocs(storeQuery);

  if (storeSnapshot.empty) {
    return null;
  }

  return storeSnapshot.docs[0].id;
}

/*
|--------------------------------------------------------------------------
| Hook
|--------------------------------------------------------------------------
*/

export function useStoreOrders():
UseStoreOrdersResult {
  const [
    orders,
    setOrders,
  ] = useState<Order[]>([]);

  const [
    storeId,
    setStoreId,
  ] = useState<string | null>(null);

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
    needsStoreSetup,
    setNeedsStoreSetup,
  ] = useState(false);

  useEffect(() => {
    let unsubscribeFromOrders:
      | (() => void)
      | null = null;

    const functions =
      getFunctions();

    const synchronizeStoreOrders =
      httpsCallable(
        functions,
        "syncStoreOrders"
      );

    const unsubscribeFromAuth =
      onAuthStateChanged(
        auth,
        async (user) => {
          if (unsubscribeFromOrders) {
            unsubscribeFromOrders();
            unsubscribeFromOrders =
              null;
          }

          if (!user) {
            setOrders([]);
            setStoreId(null);
            setIsAuthenticated(false);
            setNeedsStoreSetup(false);
            setError(
              "You must sign in."
            );
            setLoading(false);

            return;
          }

          setIsAuthenticated(true);
          setNeedsStoreSetup(false);
          setLoading(true);
          setError(null);

          try {
            const resolvedStoreId =
              await resolveStoreId(
                user.uid
              );

            if (!resolvedStoreId) {
              setOrders([]);
              setStoreId(null);
              setNeedsStoreSetup(true);
              setError(
                "No store was found for this account."
              );
              setLoading(false);

              return;
            }

            setStoreId(
              resolvedStoreId
            );

            /*
            |--------------------------------------------------------------------------
            | Synchronize Delivery Statuses
            |--------------------------------------------------------------------------
            |
            | A synchronization failure should not prevent the owner from
            | viewing their orders.
            |
            */

            try {
              await synchronizeStoreOrders();
            } catch (
              synchronizationError
            ) {
              console.error(
                "Store order synchronization failed:",
                synchronizationError
              );
            }

            /*
            |--------------------------------------------------------------------------
            | Real-Time Store Order Listener
            |--------------------------------------------------------------------------
            */

            const ordersQuery =
              query(
                collection(
                  db,
                  "orders"
                ),
                where(
                  "store.id",
                  "==",
                  resolvedStoreId
                ),
                orderBy(
                  "createdAt",
                  "desc"
                )
              );

            unsubscribeFromOrders =
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

                    setError(null);
                    setLoading(false);
                  } catch (
                    mappingError
                  ) {
                    console.error(
                      "Error mapping store orders:",
                      mappingError
                    );

                    setOrders([]);

                    setError(
                      "The order data could not be read."
                    );

                    setLoading(false);
                  }
                },

                (listenerError) => {
                  console.error(
                    "Error listening to store orders:",
                    listenerError
                  );

                  setOrders([]);

                  setError(
                    "Failed to load store orders."
                  );

                  setLoading(false);
                }
              );
          } catch (loadError) {
            console.error(
              "Error loading store orders:",
              loadError
            );

            setOrders([]);
            setStoreId(null);

            setError(
              "Failed to load store orders."
            );

            setLoading(false);
          }
        }
      );

    return () => {
      unsubscribeFromAuth();

      if (unsubscribeFromOrders) {
        unsubscribeFromOrders();
      }
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
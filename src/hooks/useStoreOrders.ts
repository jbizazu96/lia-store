"use client";

/*
|--------------------------------------------------------------------------
| useStoreOrders Hook
|--------------------------------------------------------------------------
|
| Loads the signed-in store owner's confirmed orders in real time.
|
| Responsibilities:
|
| - Wait for Firebase Authentication
| - Resolve the owner's store ID
| - Synchronize active delivery statuses
| - Subscribe to the store's orders
| - Hide unpaid payment-pending orders
| - Convert Firestore documents into Order models
| - Clean up authentication and Firestore listeners
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
| Resolve Store ID
|--------------------------------------------------------------------------
|
| First checks users/{uid}.storeId.
|
| The fallback supports store accounts whose relationship exists only
| on stores/{storeId}.ownerId.
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

  const storeQuery =
    query(
      collection(
        db,
        "stores"
      ),

      where(
        "ownerId",
        "==",
        userId
      )
    );

  const storeSnapshot =
    await getDocs(
      storeQuery
    );

  if (storeSnapshot.empty) {
    return null;
  }

  return storeSnapshot
    .docs[0]
    .id;
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
  ] = useState<string | null>(
    null
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null
  );

  const [
    isAuthenticated,
    setIsAuthenticated,
  ] = useState(false);

  const [
    needsStoreSetup,
    setNeedsStoreSetup,
  ] = useState(false);


  /*
  |--------------------------------------------------------------------------
  | Authentication And Order Listener
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    let unsubscribeFromOrders:
      | (() => void)
      | null = null;

    const functions =
      getFunctions(
        undefined,
        "us-central1"
      );

    const synchronizeStoreOrders =
      httpsCallable(
        functions,
        "syncStoreOrders"
      );

    const unsubscribeFromAuth =
      onAuthStateChanged(
        auth,

        async (
          user
        ) => {
          /*
            Remove the previous store-order listener whenever the
            authenticated user changes.
          */
          if (
            unsubscribeFromOrders
          ) {
            unsubscribeFromOrders();

            unsubscribeFromOrders =
              null;
          }

          /*
          |--------------------------------------------------------------------------
          | Signed Out
          |--------------------------------------------------------------------------
          */

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


          /*
          |--------------------------------------------------------------------------
          | Signed In
          |--------------------------------------------------------------------------
          */

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
            | A Shipday synchronization failure must not prevent the store
            | owner from viewing confirmed orders.
            |
            */

            try {
              await synchronizeStoreOrders();
            } catch (
              synchronizationError: unknown
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

                (
                  snapshot
                ) => {
                  try {
                    /*
                    |--------------------------------------------------------------------------
                    | Store Order Visibility
                    |--------------------------------------------------------------------------
                    |
                    | Stripe checkout creates a Firestore order before the
                    | customer completes payment.
                    |
                    | Store owners must never see or fulfill those records.
                    |
                    | Only the Stripe payment webhook may change:
                    |
                    | checkoutStatus
                    |
                    | to:
                    |
                    | confirmed
                    |
                    | Hidden states include:
                    |
                    | - awaiting_payment
                    | - processing
                    | - payment_failed
                    | - expired
                    |
                    | Orders without checkoutStatus are also hidden.
                    |
                    */

                    const visibleOrderDocuments =
                      snapshot.docs.filter(
                        (
                          orderDocument
                        ) => {
                          const checkoutStatus =
                            orderDocument
                              .data()
                              .checkoutStatus;

                          return (
                            checkoutStatus ===
                            "confirmed"
                          );
                        }
                      );

                    const mappedOrders =
                      visibleOrderDocuments.map(
                        mapFirestoreOrder
                      );

                    setOrders(
                      mappedOrders
                    );

                    setError(null);
                    setLoading(false);
                  } catch (
                    mappingError: unknown
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

                (
                  listenerError
                ) => {
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
          } catch (
            loadError: unknown
          ) {
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

      if (
        unsubscribeFromOrders
      ) {
        unsubscribeFromOrders();
      }
    };
  }, []);


  /*
  |--------------------------------------------------------------------------
  | Result
  |--------------------------------------------------------------------------
  */

  return {
    orders,

    storeId,

    loading,

    error,

    isAuthenticated,

    needsStoreSetup,
  };
}
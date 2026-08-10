"use client";

/*
 * The Orders screen owns the customer's history read. The first page remains
 * real-time for current status updates; older history is requested only after
 * the customer asks for more.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { mapFirestoreOrder } from "@/mappers/orderMapper";
import { isPaidConfirmedOrder } from "@/utils/orderPaymentVisibility";
import type { Order } from "@/types/order";

const ORDERS_PAGE_SIZE = 20;

function mergeOrders(
  primary: Order[],
  additional: Order[],
): Order[] {
  const orderById = new Map<string, Order>();

  [...primary, ...additional].forEach((order) => {
    if (!orderById.has(order.id)) {
      orderById.set(order.id, order);
    }
  });

  return [...orderById.values()].sort(
    (first, second) => second.createdAt.getTime() - first.createdAt.getTime(),
  );
}

export function useCustomerOrderHistory() {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestPageCursorRef =
    useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const paginationCursorRef =
    useRef<QueryDocumentSnapshot<DocumentData> | null>(null);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    latestPageCursorRef.current = null;
    paginationCursorRef.current = null;

    if (!user) {
      queueMicrotask(() => {
        setOrders([]);
        setError("You must sign in.");
        setHasMore(false);
        setLoading(false);
      });
      return;
    }

    queueMicrotask(() => {
      setLoading(true);
      setError(null);
      setHasMore(false);
      setOrders([]);
    });

    const ordersQuery = query(
      collection(db, "orders"),
      where("customer.uid", "==", user.uid),
      where("checkoutStatus", "==", "confirmed"),
      where("payment.status", "==", "paid"),
      orderBy("createdAt", "desc"),
      limit(ORDERS_PAGE_SIZE),
    );

    return onSnapshot(
      ordersQuery,
      (snapshot) => {
        try {
          const latestOrders = snapshot.docs
            .filter((document) => isPaidConfirmedOrder(document.data()))
            .map(mapFirestoreOrder);

          latestPageCursorRef.current = snapshot.docs.at(-1) ?? null;
          if (!paginationCursorRef.current) {
            paginationCursorRef.current = latestPageCursorRef.current;
          }

          setOrders((previousOrders) =>
            mergeOrders(
              latestOrders,
              previousOrders.filter(
                (order) => !latestOrders.some((latest) => latest.id === order.id),
              ),
            ),
          );
          setHasMore(snapshot.docs.length === ORDERS_PAGE_SIZE);
          setError(null);
        } catch (mappingError) {
          console.error("Unable to map customer order history:", mappingError);
          setOrders([]);
          setError("Failed to read orders.");
        } finally {
          setLoading(false);
        }
      },
      (listenerError) => {
        console.error("Unable to listen to customer order history:", listenerError);
        setOrders([]);
        setError("Failed to load orders.");
        setLoading(false);
      },
    );
  }, [authLoading, user]);

  const loadMore = useCallback(async () => {
    const cursor = paginationCursorRef.current ?? latestPageCursorRef.current;

    if (!user || !cursor || loadingMore || !hasMore) {
      return;
    }

    setLoadingMore(true);

    try {
      const nextPage = await getDocs(
        query(
          collection(db, "orders"),
          where("customer.uid", "==", user.uid),
          where("checkoutStatus", "==", "confirmed"),
          where("payment.status", "==", "paid"),
          orderBy("createdAt", "desc"),
          startAfter(cursor),
          limit(ORDERS_PAGE_SIZE),
        ),
      );
      const nextOrders = nextPage.docs
        .filter((document) => isPaidConfirmedOrder(document.data()))
        .map(mapFirestoreOrder);

      paginationCursorRef.current = nextPage.docs.at(-1) ?? cursor;
      setOrders((previousOrders) => mergeOrders(previousOrders, nextOrders));
      setHasMore(nextPage.docs.length === ORDERS_PAGE_SIZE);
    } catch (loadMoreError) {
      console.error("Unable to load more customer orders:", loadMoreError);
      setError("Failed to load more orders.");
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, user]);

  return {
    orders,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    error,
    isAuthenticated: Boolean(user),
  };
}

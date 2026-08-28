"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {collection, limit, onSnapshot, orderBy, query, where} from "firebase/firestore";
import {auth, db} from "@/lib/firebase";
import {mapFirestoreOrder, mapOrderData} from "@/mappers/orderMapper";
import {storeWorkspaceClientService} from "@/services/store/storeWorkspaceClientService";
import {useStoreWorkspace} from "@/context/StoreWorkspaceContext";
import type {Order} from "@/types/order";

const activeStatuses = ["pending", "accepted", "preparing", "ready_for_pickup"];
const emptyStats = {total: 0, pending: 0, accepted: 0, preparing: 0, readyForPickup: 0, outForDelivery: 0, completed: 0, cancelled: 0};

function isTransientDeadline(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  return code === "deadline-exceeded" || code === "functions/deadline-exceeded" || code.endsWith("/deadline-exceeded");
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function useStoreOrders(options: {status?: string; search?: string; from?: string; to?: string} = {}) {
  const {entry, loading: workspaceLoading} = useStoreWorkspace();
  const status = options.status ?? "all";
  const search = options.search?.trim() ?? "";
  const from = options.from ?? "";
  const to = options.to ?? "";
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState(emptyStats);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [needsStoreSetup, setNeedsStoreSetup] = useState(false);
  const requestId = useRef(0);
  const hasLoadedOnce = useRef(false);
  const workspaceStoreId = entry?.store?.id ?? null;
  const hasStore = entry?.hasStore === true;

  const loadHistory = useCallback(async (cursor?: string, append = false, showLoading = true) => {
    const id = ++requestId.current;
    if (append) setLoadingMore(true);
    else if (showLoading) setLoading(true);
    try {
      const options = {pageSize: 25, status, search, ...(from ? {from} : {}), ...(to ? {to} : {}), ...(cursor ? {cursor} : {})};
      let page;
      try {
        page = await storeWorkspaceClientService.getOrders(options);
      } catch (firstError) {
        if (!isTransientDeadline(firstError) || id !== requestId.current) throw firstError;
        await wait(750);
        if (id !== requestId.current) return;
        page = await storeWorkspaceClientService.getOrders(options);
      }
      if (id !== requestId.current) return;
      const mapped = page.orders.map((order) => mapOrderData(order.id, order));
      setHistoryOrders((current) => append ? [...current, ...mapped] : mapped);
      setStats(page.stats);
      setNextCursor(page.nextCursor);
      setError(null);
      hasLoadedOnce.current = true;
    } catch (loadError) {
      if (id !== requestId.current) return;
      console.error("Error loading store order history:", loadError);
      if (!append) setHistoryOrders([]);
      setError("Failed to load store orders.");
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [from, search, status, to]);

  useEffect(() => {
    let unsubscribeOrders: (() => void) | null = null;
    if (workspaceLoading) return;
    if (!auth.currentUser) {
      hasLoadedOnce.current = false;
      queueMicrotask(() => {
        setIsAuthenticated(false);
        setError("You must sign in.");
        setLoading(false);
      });
      return;
    }
    if (!hasStore || !workspaceStoreId) {
      hasLoadedOnce.current = false;
      queueMicrotask(() => {
        setIsAuthenticated(true);
        setNeedsStoreSetup(true);
        setLoading(false);
      });
      return;
    }
    queueMicrotask(() => {
      setIsAuthenticated(true);
      setStoreId(workspaceStoreId);
      setNeedsStoreSetup(false);
    });
    queueMicrotask(() => void loadHistory(undefined, false, !hasLoadedOnce.current));
    const activeQuery = query(
          collection(db, "orders"),
          where("store.id", "==", workspaceStoreId),
          where("checkoutStatus", "==", "confirmed"),
          where("payment.status", "==", "paid"),
          where("status", "in", activeStatuses),
          orderBy("createdAt", "desc"),
          limit(50),
    );
    unsubscribeOrders = onSnapshot(activeQuery, (snapshot) => {
      setActiveOrders(snapshot.docs.map(mapFirestoreOrder));
    }, (listenerError) => console.error("Error listening to active store orders:", listenerError));
    return () => {
      unsubscribeOrders?.();
    };
  }, [hasStore, loadHistory, workspaceLoading, workspaceStoreId]);

  const normalizedSearch = search.toLocaleLowerCase("en-US");
  const fromTime = from ? new Date(from).getTime() : null;
  const toTime = to ? new Date(to).getTime() : null;
  const visibleActiveOrders = activeOrders.filter((order) =>
    (status === "all" || order.status === status) &&
    (fromTime === null || (order.payment?.paidAt ?? order.createdAt).getTime() >= fromTime) &&
    (toTime === null || (order.payment?.paidAt ?? order.createdAt).getTime() <= toTime) &&
    (!normalizedSearch || [order.id, order.orderNumber, order.customer.name, order.customer.email]
      .join(" ").toLocaleLowerCase("en-US").includes(normalizedSearch)),
  );
  const mergedOrders = new Map(historyOrders.map((order) => [order.id, order]));
  visibleActiveOrders.forEach((order) => {
    const historyOrder = mergedOrders.get(order.id);
    mergedOrders.set(order.id, {
      ...historyOrder,
      ...order,
      storeFinancials: historyOrder?.storeFinancials,
    });
  });
  const orders = Array.from(mergedOrders.values())
    .sort((left, right) => {
      const leftDate = left.payment?.paidAt ?? left.createdAt;
      const rightDate = right.payment?.paidAt ?? right.createdAt;
      return rightDate.getTime() - leftDate.getTime();
    });
  const loadMore = useCallback(async () => {
    if (nextCursor && !loadingMore) await loadHistory(nextCursor, true);
  }, [loadHistory, loadingMore, nextCursor]);

  return {
    orders,
    stats,
    storeId,
    loading,
    loadingMore,
    error,
    isAuthenticated,
    needsStoreSetup,
    hasMore: nextCursor !== null,
    loadMore,
    refreshOrders: () => loadHistory(undefined, false, false),
  };
}

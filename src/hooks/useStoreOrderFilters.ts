"use client";

/*
|--------------------------------------------------------------------------
| useStoreOrderFilters Hook
|--------------------------------------------------------------------------
|
| Handles search, status filtering, filtered results, and order statistics
| for the store orders page.
|
*/

import {
  useMemo,
  useState,
} from "react";

import type {
  Order,
} from "@/types/order";

/*
|--------------------------------------------------------------------------
| Hook Parameters
|--------------------------------------------------------------------------
*/

interface UseStoreOrderFiltersParams {
  orders: Order[];

  initialStatus?: string;
}

/*
|--------------------------------------------------------------------------
| Hook Result
|--------------------------------------------------------------------------
*/

interface UseStoreOrderFiltersResult {
  filteredOrders: Order[];

  searchQuery: string;

  statusFilter: string;

  hasFilters: boolean;

  stats: {
    total: number;
    pending: number;
    completed: number;
    cancelled: number;
  };

  setSearchQuery: (
    value: string
  ) => void;

  setStatusFilter: (
    value: string
  ) => void;

  clearFilters: () => void;
}

/*
|--------------------------------------------------------------------------
| Hook
|--------------------------------------------------------------------------
*/

export function useStoreOrderFilters({
  orders,
  initialStatus = "all",
}: UseStoreOrderFiltersParams):
UseStoreOrderFiltersResult {
  const [
    searchQuery,
    setSearchQuery,
  ] = useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState(initialStatus);

  /*
  |--------------------------------------------------------------------------
  | Filtered Orders
  |--------------------------------------------------------------------------
  */

  const filteredOrders =
    useMemo(() => {
      let result = orders;

      if (statusFilter !== "all") {
        result = result.filter(
          (order) =>
            order.status ===
            statusFilter
        );
      }

      const normalizedSearch =
        searchQuery
          .trim()
          .toLowerCase();

      if (normalizedSearch) {
        result = result.filter(
          (order) =>
            order.customer.name
              .toLowerCase()
              .includes(
                normalizedSearch
              ) ||
            order.id
              .toLowerCase()
              .includes(
                normalizedSearch
              )
        );
      }

      // Present orders in the same sequence as the fulfillment workflow.
      // The source listener already provides newest-first ordering, which
      // remains intact for orders sharing a status.
      const statusPriority: Record<Order["status"], number> = {
        pending: 0,
        accepted: 1,
        preparing: 2,
        ready_for_pickup: 3,
        out_for_delivery: 4,
        cancelled: 5,
        completed: 6,
      };

      return [...result].sort(
        (firstOrder, secondOrder) =>
          statusPriority[firstOrder.status] -
          statusPriority[secondOrder.status]
      );
    }, [
      orders,
      searchQuery,
      statusFilter,
    ]);

  /*
  |--------------------------------------------------------------------------
  | Statistics
  |--------------------------------------------------------------------------
  */

  const stats =
    useMemo(
      () => ({
        total: orders.length,

        pending:
          orders.filter(
            (order) =>
              order.status ===
              "pending"
          ).length,

        completed:
          orders.filter(
            (order) =>
              order.status ===
              "completed"
          ).length,

        cancelled:
          orders.filter(
            (order) =>
              order.status ===
              "cancelled"
          ).length,
      }),
      [orders]
    );

  /*
  |--------------------------------------------------------------------------
  | Helpers
  |--------------------------------------------------------------------------
  */

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
  };

  const hasFilters =
    searchQuery.trim().length > 0 ||
    statusFilter !== "all";

  return {
    filteredOrders,
    searchQuery,
    statusFilter,
    hasFilters,
    stats,
    setSearchQuery,
    setStatusFilter,
    clearFilters,
  };
}

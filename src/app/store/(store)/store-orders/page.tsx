"use client";

/*
|--------------------------------------------------------------------------
| Store Orders Page
|--------------------------------------------------------------------------
|
| Displays the signed-in store owner's orders.
|
| Data loading, authentication, store resolution, synchronization, and the
| real-time Firestore listener are handled by useStoreOrders.
|
| This page handles only:
| - Searching
| - Status filtering
| - Statistics
| - Rendering
|
*/

import {
  useDeferredValue,
  useEffect,
  useState,
} from "react";

import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  AnimatePresence,
} from "framer-motion";

import {
  useStoreOrders,
} from "@/hooks/useStoreOrders";

import {
  BrandedLoader,
} from "@/components/ui/BrandedLoader";

import {
  EmptyOrders,
} from "@/components/store/orders/EmptyOrders";

import {
  OrderCard,
} from "@/components/store/orders/OrderCard";

import {
  OrderFilters,
} from "@/components/store/orders/OrderFilters";

import {
  OrderStats,
} from "@/components/store/orders/OrderStats";

/*
|--------------------------------------------------------------------------
| Page Component
|--------------------------------------------------------------------------
*/

export default function StoreOrdersPage() {
  const router = useRouter();

  const searchParams =
    useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const deferredSearchValue = useDeferredValue(searchQuery.trim());
  const deferredSearch = deferredSearchValue.length >= 2 ? deferredSearchValue : "";
  const hasFilters = Boolean(deferredSearch || fromDate || toDate) || statusFilter !== "all";
  const from = fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : "";
  const to = toDate ? new Date(`${toDate}T23:59:59.999`).toISOString() : "";

  /*
  |--------------------------------------------------------------------------
  | Store Orders Hook
  |--------------------------------------------------------------------------
  */

  const {
    orders,
    stats,
    loading,
    loadingMore,
    error,
    isAuthenticated,
    needsStoreSetup,
    hasMore,
    loadMore,
    refreshOrders,
  } = useStoreOrders({status: statusFilter, search: deferredSearch, from, to});
  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setFromDate("");
    setToDate("");
  };
  const exportLoadedOrders = () => {
    const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = orders.map((order) => [
      order.orderNumber,
      order.payment?.paidAt?.toISOString() ?? order.createdAt.toISOString(),
      order.customer.name,
      order.status,
      order.items.reduce((sum, item) => sum + Math.max(0, item.quantity || 0), 0),
      order.storeFinancials?.grossStoreAmount ?? order.pricing.subtotal + order.pricing.tax,
      order.storeFinancials?.liaCommission ?? "",
      order.storeFinancials?.storeRefundReversal ?? 0,
      order.storeFinancials?.netStoreEarning ?? "",
      order.storeFinancials?.settlementStatus ?? "not_created",
      order.storeFinancials?.transferStatus ?? "not_created",
    ]);
    const csv = [["Order", "Paid at", "Customer", "Status", "Units", "Gross store amount", "LIA commission", "Refund adjustment", "Net store earning", "Settlement", "Transfer"], ...rows]
      .map((row) => row.map(quote).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"}));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `store-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  /*
  |--------------------------------------------------------------------------
  | Authentication Redirect
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }

    if (needsStoreSetup) {
      router.replace("/store/onboarding/owner");
    }
  }, [
    loading,
    isAuthenticated,
    needsStoreSetup,
    router,
  ]);

  /*
  |--------------------------------------------------------------------------
  | Loading State
  |--------------------------------------------------------------------------
  */

  if (loading) {
    return (
      <BrandedLoader
        message="Loading Orders"
      />
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Redirect State
  |--------------------------------------------------------------------------
  */

  if (
    !isAuthenticated ||
    needsStoreSetup
  ) {
    return null;
  }

  /*
  |--------------------------------------------------------------------------
  | Error State
  |--------------------------------------------------------------------------
  */

  if (error) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center">
        <p className="text-lg text-gray-500">
          {error}
        </p>

        <button
          type="button"
          onClick={() => void refreshOrders()}
          className="mt-4 rounded-xl bg-orange-500 px-6 py-2 font-semibold text-white transition hover:bg-orange-600"
        >
          Try Again
        </button>
      </div>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Page
  |--------------------------------------------------------------------------
  */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Store Orders
          </h1>

          <p className="text-sm text-gray-500">
            Manage all your store orders
          </p>
        </div>
      </div>

      {/* Statistics */}
      <OrderStats {...stats} />

      {/* Filters */}
      <OrderFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        onClearFilters={clearFilters}
        hasFilters={hasFilters}
        fromDate={fromDate}
        toDate={toDate}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
        onExport={exportLoadedOrders}
      />

      {/* Orders */}
      {orders.length === 0 && hasFilters ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center">
          <p className="text-lg text-gray-500">
            No orders found
          </p>

          <p className="text-sm text-gray-400">
            {hasFilters
              ? "Try adjusting your filters"
              : "Orders will appear here"}
          </p>

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 text-sm font-medium text-orange-600 hover:text-orange-700"
            >
              Clear all filters
            </button>
          )}
        </div>
      ) : orders.length === 0 ? (
        <EmptyOrders />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-400">
            Showing{" "}
            {orders.length} loaded order{orders.length === 1 ? "" : "s"}
          </p>

          <AnimatePresence mode="popLayout">
            {orders.map(
              (order, index) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  index={index}
                />
              )
            )}
          </AnimatePresence>
          {hasMore && <div className="flex justify-center pt-3"><button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{loadingMore ? "Loading…" : "Load more orders"}</button></div>}
        </div>
      )}
    </div>
  );
}

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
  useEffect,
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
  useStoreOrderFilters,
} from "@/hooks/useStoreOrderFilters";

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

  /*
  |--------------------------------------------------------------------------
  | Store Orders Hook
  |--------------------------------------------------------------------------
  */

  const {
    orders,
    loading,
    error,
    isAuthenticated,
    needsStoreSetup,
  } = useStoreOrders();

  /*
  |--------------------------------------------------------------------------
  | Store Order Filters
  |--------------------------------------------------------------------------
  */

  const {
    filteredOrders,
    searchQuery,
    statusFilter,
    hasFilters,
    stats,
    setSearchQuery,
    setStatusFilter,
    clearFilters,
  } = useStoreOrderFilters({
    orders,

    initialStatus:
      searchParams.get("status") ??
      "all",
  });

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
      router.replace("/store/create");
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
          onClick={() =>
            router.refresh()
          }
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
      />

      {/* Orders */}
      {orders.length === 0 ? (
        <EmptyOrders />
      ) : filteredOrders.length ===
        0 ? (
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
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-400">
            Showing{" "}
            {filteredOrders.length} of{" "}
            {orders.length} orders
          </p>

          <AnimatePresence mode="popLayout">
            {filteredOrders.map(
              (order, index) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  index={index}
                />
              )
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
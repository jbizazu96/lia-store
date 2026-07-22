"use client";

/*
|--------------------------------------------------------------------------
| Store Dashboard Page
|--------------------------------------------------------------------------
|
| Dashboard data is loaded through useStoreDashboard.
|
| This page handles:
|
| - Authentication redirects
| - Store setup redirects
| - Loading and error states
| - Rendering dashboard UI
|
*/

import {
  useEffect,
} from "react";

import {
  useRouter,
} from "next/navigation";

import Link from "next/link";

import {
  motion,
} from "framer-motion";

import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Clock,
  DollarSign,
  Package,
  ShoppingBag,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";

import {
  useStoreDashboard,
} from "@/hooks/useStoreDashboard";

import {
  BrandedLoader,
} from "@/components/ui/BrandedLoader";

import {
  ORDER_STATUS_CONFIG,
} from "@/config/orderStatus";

import {
  formatOrderCurrency,
  formatOrderDate,
} from "@/utils/orderDisplay";

/*
|--------------------------------------------------------------------------
| Page
|--------------------------------------------------------------------------
*/

export default function DashboardPage() {
  const router =
    useRouter();

  const {
    data,
    loading,
    error,
    isAuthenticated,
    needsStoreSetup,
    refreshDashboard,
  } = useStoreDashboard();

  /*
  |--------------------------------------------------------------------------
  | Redirects
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
      router.replace(
        "/store/create"
      );
    }
  }, [
    loading,
    isAuthenticated,
    needsStoreSetup,
    router,
  ]);

  /*
  |--------------------------------------------------------------------------
  | Loading
  |--------------------------------------------------------------------------
  */

  if (loading) {
    return (
      <BrandedLoader
        message="Loading Dashboard"
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
  | Error
  |--------------------------------------------------------------------------
  */

  if (
    error ||
    !data
  ) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center">
        <AlertCircle className="mx-auto mb-4 h-16 w-16 text-gray-300" />

        <p className="text-lg text-gray-500">
          {error ??
            "Dashboard data is unavailable."}
        </p>

        <button
          type="button"
          onClick={() =>
            refreshDashboard()
          }
          className="mt-4 rounded-xl bg-orange-500 px-6 py-2 font-semibold text-white transition hover:bg-orange-600"
        >
          Try Again
        </button>
      </div>
    );
  }

  const {
    storeName,
    stats,
    recentOrders,
  } = data;

  /*
  |--------------------------------------------------------------------------
  | Statistic Cards
  |--------------------------------------------------------------------------
  */

  const statCards = [
    {
      title:
        "Total Orders",

      value:
        stats.totalOrders,

      icon:
        ShoppingBag,

      background:
        "bg-blue-50",

      text:
        "text-blue-600",
    },

    {
      title:
        "Revenue",

      value:
        formatOrderCurrency(
          stats.totalRevenue
        ),

      icon:
        DollarSign,

      background:
        "bg-green-50",

      text:
        "text-green-600",

      growth:
        stats.revenueGrowth,
    },

    {
      title:
        "Customers",

      value:
        stats.totalCustomers,

      icon:
        Users,

      background:
        "bg-purple-50",

      text:
        "text-purple-600",
    },

    {
      title:
        "Rating",

      value:
        `${stats.averageRating.toFixed(
          1
        )} ★`,

      icon:
        Star,

      background:
        "bg-yellow-50",

      text:
        "text-yellow-600",
    },
  ];

  /*
  |--------------------------------------------------------------------------
  | Dashboard
  |--------------------------------------------------------------------------
  */

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <motion.div
        initial={{
          opacity: 0,
          y: 20,
        }}
        animate={{
          opacity: 1,
          y: 0,
        }}
        className="rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 p-6 text-white"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold">
              Welcome to {storeName}! 👋
            </h2>

            <p className="mt-1 text-orange-100">
              Here&apos;s what&apos;s
              happening with your store
              today
            </p>
          </div>

          <div className="flex items-center gap-3 self-start rounded-full bg-white/20 px-4 py-2 sm:self-auto">
            <Clock className="h-5 w-5" />

            <span className="font-medium">
              {stats.todayOrders} orders
              today
            </span>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(
          (stat, index) => (
            <motion.div
              key={stat.title}
              initial={{
                opacity: 0,
                y: 20,
              }}
              animate={{
                opacity: 1,
                y: 0,
              }}
              transition={{
                delay:
                  index * 0.05,
              }}
              className="rounded-2xl bg-white p-6 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">
                    {stat.title}
                  </p>

                  <p className="mt-1 text-2xl font-bold text-gray-800">
                    {stat.value}
                  </p>

                  {stat.growth !==
                    undefined && (
                    <p className="mt-1 text-xs text-green-600">
                      <TrendingUp className="mr-1 inline h-3 w-3" />

                      {stat.growth >= 0
                        ? "+"
                        : ""}
                      {stat.growth}% this
                      week
                    </p>
                  )}
                </div>

                <div
                  className={`${stat.background} rounded-xl p-3`}
                >
                  <stat.icon
                    className={`h-6 w-6 ${stat.text}`}
                  />
                </div>
              </div>
            </motion.div>
          )
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link
          href="/store/store-orders"
          className="group rounded-xl bg-white p-4 text-center transition hover:shadow-md"
        >
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-orange-500">
            <ShoppingBag className="h-6 w-6 text-white" />
          </div>

          <p className="text-sm font-medium text-gray-700">
            View Orders
          </p>
        </Link>

        <Link
          href="/store/products/add"
          className="group rounded-xl bg-white p-4 text-center transition hover:shadow-md"
        >
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500">
            <Package className="h-6 w-6 text-white" />
          </div>

          <p className="text-sm font-medium text-gray-700">
            Add Product
          </p>
        </Link>
      </div>

      {/* Orders And Pending */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Orders */}
        <motion.div
          initial={{
            opacity: 0,
            y: 20,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            delay: 0.2,
          }}
          className="rounded-2xl bg-white p-6 shadow-sm"
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-bold text-gray-800">
              Recent Orders
            </h3>

            <Link
              href="/store/store-orders"
              className="flex items-center gap-1 text-sm text-orange-600 hover:text-orange-700"
            >
              View All

              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {recentOrders.length ===
          0 ? (
            <div className="py-8 text-center">
              <ShoppingBag className="mx-auto mb-3 h-12 w-12 text-gray-300" />

              <p className="text-gray-500">
                No orders yet
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentOrders.map(
                (order) => {
                  const statusConfig =
                    order.status in
                    ORDER_STATUS_CONFIG
                      ? ORDER_STATUS_CONFIG[
                          order.status as keyof typeof ORDER_STATUS_CONFIG
                        ]
                      : ORDER_STATUS_CONFIG.pending;

                  return (
                    <Link
                      key={order.id}
                      href={`/store/store-orders/${order.id}`}
                      className="flex items-center justify-between rounded-xl p-3 transition hover:bg-gray-50"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={`rounded-full px-2 py-1 text-xs font-medium ${statusConfig.color}`}
                        >
                          {
                            statusConfig.label
                          }
                        </div>

                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-800">
                            {
                              order.customerName
                            }
                          </p>

                          <p className="text-sm text-gray-500">
                            {formatOrderDate(
                              order.createdAt
                                ? new Date(
                                    order.createdAt
                                  )
                                : null
                            )}{" "}
                            •{" "}
                            {
                              order.itemCount
                            }{" "}
                            items
                          </p>
                        </div>
                      </div>

                      <p className="ml-3 flex-shrink-0 font-bold text-gray-800">
                        {formatOrderCurrency(
                          order.storeTotal
                        )}
                      </p>
                    </Link>
                  );
                }
              )}
            </div>
          )}
        </motion.div>

        {/* Pending Orders */}
        <motion.div
          initial={{
            opacity: 0,
            y: 20,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            delay: 0.3,
          }}
          className="rounded-2xl bg-white p-6 shadow-sm"
        >
          <h3 className="mb-4 font-bold text-gray-800">
            Pending Orders
          </h3>

          {stats.pendingOrders >
          0 ? (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600" />

                <div>
                  <p className="font-semibold text-yellow-800">
                    {
                      stats.pendingOrders
                    }{" "}
                    orders waiting
                  </p>

                  <p className="mt-1 text-sm text-yellow-700">
                    These orders need
                    your attention. Accept
                    them to start
                    preparing.
                  </p>

                  <Link
                    href="/store/store-orders?status=pending"
                    className="mt-3 inline-block rounded-lg bg-yellow-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-yellow-700"
                  >
                    View Pending Orders
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>

              <p className="text-gray-500">
                No pending orders
              </p>

              <p className="text-sm text-gray-400">
                All orders are being
                processed
              </p>
            </div>
          )}

          {/* Quick Stats */}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-xs text-gray-500">
                Today&apos;s Orders
              </p>

              <p className="text-lg font-bold text-gray-800">
                {stats.todayOrders}
              </p>
            </div>

            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-xs text-gray-500">
                This Week
              </p>

              <p className="text-lg font-bold text-gray-800">
                {stats.weeklyGrowth >=
                0
                  ? "+"
                  : ""}
                {stats.weeklyGrowth}%
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
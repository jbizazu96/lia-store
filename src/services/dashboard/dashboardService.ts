/*
|--------------------------------------------------------------------------
| Dashboard Service
|--------------------------------------------------------------------------
|
| Reads and calculates store dashboard data.
|
| Responsibilities:
|
| - Load the store.
| - Load the store's recent orders.
| - Calculate dashboard statistics.
| - Convert Order domain models into dashboard view data.
|
| React components and hooks should not query Firestore directly.
|
*/

import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import {
  db,
} from "@/lib/firebase";

import {
  mapFirestoreOrder,
} from "@/mappers/orderMapper";

import {
  storeService,
} from "@/services/store/storeService";

import type {
  DashboardData,
  DashboardRecentOrder,
  DashboardStats,
} from "@/types/dashboard";

import type {
  Order,
} from "@/types/order";

/*
|--------------------------------------------------------------------------
| Empty Statistics
|--------------------------------------------------------------------------
*/

const EMPTY_DASHBOARD_STATS:
DashboardStats = {
  totalOrders: 0,

  totalRevenue: 0,

  totalCustomers: 0,

  averageRating: 0,

  pendingOrders: 0,

  todayOrders: 0,

  weeklyGrowth: 0,

  revenueGrowth: 0,
};

const DASHBOARD_ORDER_STATUS_PRIORITY: Record<
  Order["status"],
  number
> = {
  pending: 0,
  accepted: 1,
  preparing: 2,
  ready_for_pickup: 3,
  out_for_delivery: 4,
  cancelled: 5,
  completed: 6,
};

/*
|--------------------------------------------------------------------------
| Store Revenue
|--------------------------------------------------------------------------
|
| Delivery fees and driver tips are excluded because they are not store
| revenue.
|
*/

function calculateStoreRevenue(
  order: Order
): number {
  return (
    order.pricing.subtotal +
    order.pricing.tax
  );
}

/*
|--------------------------------------------------------------------------
| Same Calendar Day
|--------------------------------------------------------------------------
*/

function isToday(
  date: Date
): boolean {
  const today =
    new Date();

  return (
    date.getFullYear() ===
      today.getFullYear() &&
    date.getMonth() ===
      today.getMonth() &&
    date.getDate() ===
      today.getDate()
  );
}

/*
|--------------------------------------------------------------------------
| Calculate Dashboard Data
|--------------------------------------------------------------------------
*/

function calculateDashboardStats(
  orders: Order[],
  averageRating: number
): DashboardStats {
  const customerIds =
    new Set<string>();

  let totalRevenue = 0;
  let pendingOrders = 0;
  let todayOrders = 0;

  orders.forEach((order) => {
    totalRevenue +=
      calculateStoreRevenue(
        order
      );

    if (order.customer.uid) {
      customerIds.add(
        order.customer.uid
      );
    }

    if (
      order.status === "pending"
    ) {
      pendingOrders += 1;
    }

    if (
      order.createdAt &&
      isToday(order.createdAt)
    ) {
      todayOrders += 1;
    }
  });

  return {
    ...EMPTY_DASHBOARD_STATS,

    totalOrders:
      orders.length,

    totalRevenue,

    totalCustomers:
      customerIds.size,

    averageRating,

    pendingOrders,

    todayOrders,
  };
}

/*
|--------------------------------------------------------------------------
| Map Recent Order
|--------------------------------------------------------------------------
*/

function mapDashboardRecentOrder(
  order: Order
): DashboardRecentOrder {
  return {
    id:
      order.id,

    customerName:
      order.customer.name ||
      "Customer",

    storeTotal:
      calculateStoreRevenue(
        order
      ),

    status:
      order.status,

    createdAt:
      order.createdAt
        ? order.createdAt.toISOString()
        : "",

    itemCount:
      order.items.length,
  };
}

/*
|--------------------------------------------------------------------------
| Dashboard Service
|--------------------------------------------------------------------------
*/

export const dashboardService = {
  /*
  |--------------------------------------------------------------------------
  | Get Store Dashboard
  |--------------------------------------------------------------------------
  */

  async getStoreDashboard(
    storeId: string
  ): Promise<DashboardData | null> {
    if (!storeId.trim()) {
      return null;
    }

    const store =
      await storeService.getStore(
        storeId
      );

    if (!store) {
      return null;
    }

    const ordersQuery =
      query(
        collection(
          db,
          "orders"
        ),
        where(
          "store.id",
          "==",
          storeId
        ),
        orderBy(
          "createdAt",
          "desc"
        ),
        limit(100)
      );

    const ordersSnapshot =
      await getDocs(
        ordersQuery
      );

    const orders =
      ordersSnapshot.docs.map(
        mapFirestoreOrder
      );

    const stats =
      calculateDashboardStats(
        orders,
        store.rating ?? 0
      );

    const recentOrders =
      [...orders]
        .sort(
          (firstOrder, secondOrder) =>
            DASHBOARD_ORDER_STATUS_PRIORITY[
              firstOrder.status
            ] -
            DASHBOARD_ORDER_STATUS_PRIORITY[
              secondOrder.status
            ]
        )
        .slice(0, 4)
        .map(
          mapDashboardRecentOrder
        );

    return {
      storeName:
        store.name,

      stats,

      recentOrders,
    };
  },
};

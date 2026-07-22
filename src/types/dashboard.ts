/*
|--------------------------------------------------------------------------
| Dashboard Domain Models
|--------------------------------------------------------------------------
|
| Shared dashboard models used throughout the application.
|
| These types represent dashboard data only.
| They are NOT Firestore documents.
|
*/

/*
|--------------------------------------------------------------------------
| Dashboard Statistics
|--------------------------------------------------------------------------
*/

export interface DashboardStats {
  /*
   * Total number of orders.
   */
  totalOrders: number;

  /*
   * Revenue earned by the store.
   *
   * Delivery fees are excluded.
   */
  totalRevenue: number;

  /*
   * Number of unique customers.
   */
  totalCustomers: number;

  /*
   * Average customer rating.
   */
  averageRating: number;

  /*
   * Orders waiting for store action.
   */
  pendingOrders: number;

  /*
   * Orders received today.
   */
  todayOrders: number;

  /*
   * Weekly order growth percentage.
   */
  weeklyGrowth: number;

  /*
   * Weekly revenue growth percentage.
   */
  revenueGrowth: number;
}

/*
|--------------------------------------------------------------------------
| Dashboard Recent Order
|--------------------------------------------------------------------------
*/

export interface DashboardRecentOrder {
  /*
   * Firestore document ID.
   */
  id: string;

  /*
   * Customer name.
   */
  customerName: string;

  /*
   * Revenue earned by the store.
   */
  storeTotal: number;

  /*
   * Current order status.
   */
  status: string;

  /*
   * ISO date string.
   */
  createdAt: string;

  /*
   * Number of products purchased.
   */
  itemCount: number;
}

/*
|--------------------------------------------------------------------------
| Dashboard Data
|--------------------------------------------------------------------------
*/

export interface DashboardData {
  /*
   * Store name.
   */
  storeName: string;

  /*
   * Dashboard statistics.
   */
  stats: DashboardStats;

  /*
   * Latest orders.
   */
  recentOrders: DashboardRecentOrder[];
}
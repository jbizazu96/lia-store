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
   * Net settlement earnings after completed store refund reversals.
   */
  netStoreEarnings: number;

  currentWeekNetEarnings: number;

  refundDeductions: number;

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

  activeOrders: number;

  /*
   * Orders received today.
   */
  todayOrders: number;

  /*
   * Weekly order growth percentage.
   */
  weeklyGrowth: number;

  /*
   * Calendar-week net-earnings growth against the previous week.
   */
  earningsGrowth: number;
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
   * Gross order amount shown on the store order page: merchandise subtotal
   * plus sales tax, before the marketplace commission is deducted.
   */
  grossStoreOrderAmount: number;

  /** Same amount displayed by the store Orders card. */
  displayStoreAmount: number;

  /** Gross until settlement exists; net afterward. */
  amountType: "gross" | "net";

  /*
   * Current order status.
   */
  status: string;

  /*
   * Trusted Stripe payment timestamp as an ISO string.
   */
  paidAt: string;

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

  timeZone: string;

  /*
   * Dashboard statistics.
   */
  stats: DashboardStats;

  /*
   * Latest orders.
   */
  recentOrders: DashboardRecentOrder[];
}

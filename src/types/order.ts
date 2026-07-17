/*
|--------------------------------------------------------------------------
| Order Domain Model
|--------------------------------------------------------------------------
|
| This file defines the Order domain for the entire LIA Store application.
|
| IMPORTANT
| ---------
| This is NOT a Firestore model.
| This is NOT a Shipday model.
| This is NOT a Stripe model.
|
| This is OUR business model.
|
| Every feature in the application should work with these interfaces.
|
*/

/* ==========================================================================
   CUSTOMER
   ========================================================================== */

/**
 * Customer placing the order.
 */
export interface OrderCustomer {
  uid: string;

  name: string;

  email: string;

  phone: string;

  address: string;

  latitude: number;

  longitude: number;
}

/* ==========================================================================
   STORE
   ========================================================================== */

/**
 * Store fulfilling the order.
 */
export interface OrderStore {
  id: string;

  /**
   * Firebase Authentication UID of the store owner.
   *
   * Used for:
   * • Store notifications
   * • Push notifications
   * • Analytics
   * • Future payouts
   */
  ownerId: string;

  name: string;

  address: string;

  phone: string;

  latitude: number;

  longitude: number;
}

/* ==========================================================================
   ITEMS
   ========================================================================== */

/**
 * Product purchased.
 */
export interface OrderItem {
  id: string;

  name: string;

  price: number;

  quantity: number;

  imageUrl?: string;

      /**
     * Product size.
     */
    size?: {
      value: number;
      unit: string;
    } | null;
}

/* ==========================================================================
   PRICING
   ========================================================================== */

/**
 * Financial breakdown of the order.
 */
export interface OrderPricing {
  subtotal: number;

  deliveryFee: number;

  tax: number;

  tip: number;

  total: number;
}

/* ==========================================================================
   DELIVERY
   ========================================================================== */

/**
 * Delivery information.
 */
export interface DeliveryInfo {
  instructions?: string;

  distanceMiles: number;

  estimatedMinutes?: number;
}

/* ==========================================================================
   PAYMENT
   ========================================================================== */

/**
 * Payment information.
 *
 * These fields will be populated after
 * Stripe integration.
 */
export interface PaymentInfo {
  provider?: "stripe";

  paymentIntentId?: string;

  status?: "pending" | "paid" | "failed" | "refunded";

  paidAt?: Date;
}

/* ==========================================================================
   SHIPDAY
   ========================================================================== */

/**
 * Shipday delivery information.
 *
 * Populated after the store accepts an order.
 */
export interface ShipdayInfo {
  orderId?: number;

  status?:
    | "pending"
    | "created"
    | "waiting"
    | "started"
    | "picked_up"
    | "on_the_way"
    | "Completed"
    | "failed"
    | "cancelled";

  active?: boolean;
  trackingUrl?: string;
  driverName?: string;
  driverPhone?: string;
  eta?: Date;
  createdAt?: Date;
  lastUpdated?: Date;
  lastSyncAt?: Date;
  error?: string;
}

/* ==========================================================================
   ORDER STATUS
   ========================================================================== */

/**
 * Valid order statuses inside LIA.
 */
export type OrderStatus =
  | "pending"
  | "accepted"
  | "preparing"
  | "ready_for_pickup"
  | "out_for_delivery"
  | "completed"
  | "cancelled";

/* ==========================================================================
   STATUS HISTORY
   ========================================================================== */

/**
 * Keeps track of every status change.
 */
export interface StatusHistory {
  status: OrderStatus;

  timestamp: Date;

  note?: string;
}

/* ==========================================================================
   MAIN ORDER
   ========================================================================== */

/**
 * Main Order object used throughout the application.
 */
export interface Order {
  /**
   * Firestore document ID.
   */
  id: string;

  /**
   * Human-readable order number.
   */
  orderNumber: string;

  /**
   * Customer placing the order.
   */
  customer: OrderCustomer;

  /**
   * Store fulfilling the order.
   */
  store: OrderStore;

  /**
   * Products purchased.
   */
  items: OrderItem[];

  /**
   * Financial information.
   */
  pricing: OrderPricing;

  /**
   * Delivery information.
   */
  delivery: DeliveryInfo;

  /**
   * Current order status.
   */
  status: OrderStatus;

  /**
   * Timeline of status changes.
   */
  statusHistory?: StatusHistory[];

  /**
   * Stripe information.
   */
  payment?: PaymentInfo;

  /**
   * Shipday delivery information.
   */
  shipday?: ShipdayInfo;

  /**
   * Audit timestamps.
   */
  createdAt: Date;

  updatedAt?: Date;
}
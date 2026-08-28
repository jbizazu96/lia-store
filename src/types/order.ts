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

export interface OrderPricing {
  /*
    Merchandise total before delivery, platform fees, tax, and tip.
  */
  subtotal: number;

  /*
    Distance-based delivery charge.

    This can be zero when the order qualifies for free delivery.
  */
  deliveryFee: number;

  /*
    Customer-facing platform fee retained by LIA.

    Current MVP defaults:

    - 5% of the merchandise subtotal
    - Minimum $1.99
    - Maximum $9.99

    These defaults will later be replaced by pricing settings managed
    through the admin portal.
  */
  serviceFee: number;

  /*
    Authoritative Stripe Tax amount charged to the customer.
  */
  tax: number;

  /*
    Customer-selected driver tip.
  */
  tip: number;

  /*
    Final amount charged to the customer.

    subtotal
    + deliveryFee
    + serviceFee
    + tax
    + tip
  */
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

export interface PickupInfo {
  /** Available only to the customer and the authenticated fulfilling store while ready. */
  code?: string | null;
  storeAddress?: string;
  instructions?: string | null;
  customerInstructions?: string | null;
  preparationMinutes?: number;
  readyAt?: Date;
  pickedUpAt?: Date;
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

/** Authoritative store-facing accounting assembled by the backend. */
export interface StoreOrderFinancials {
  currency: string;
  merchandiseSubtotal: number;
  salesTax: number;
  grossStoreAmount: number;
  liaCommission: number | null;
  originalStoreEarning: number | null;
  refundedMerchandise: number;
  refundedSalesTax: number;
  storeRefundReversal: number;
  netStoreEarning: number | null;
  customerRefundTotal: number;
  refundStatus: string | null;
  settlementStatus: string;
  transferStatus: string;
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
   LIA INVESTIGATION
   ========================================================================== */

/**
 * Store-safe summary of an order claim or report. Private customer and admin
 * notes remain in their protected case records.
 */
export interface OrderInvestigation {
  active: boolean;
  hasRefundClaim: boolean;
  refundClaimStatus?: string | null;
  refundStatus?: string | null;
  hasSupportReport: boolean;
  supportRequestStatus?: string | null;
  updatedAt?: Date;
}

/* ==========================================================================
   MAIN ORDER
   ========================================================================== */

/**
 * Main Order object used throughout the application.
 */
export interface Order {
  fulfillmentType: "delivery" | "pickup";
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
  delivery?: DeliveryInfo;
  pickup?: PickupInfo;

  /**
   * Current order status.
   */
  status: OrderStatus;

  /**
   * Reason supplied by the store when it cancels an order.
   */
  cancellationReason?: string;

  /** Non-sensitive LIA claim/report status visible to the owning store. */
  liaInvestigation?: OrderInvestigation;

  /**
   * Timeline of status changes.
   */
  statusHistory?: StatusHistory[];

  /**
   * Stripe information.
   */
  payment?: PaymentInfo;

  storeFinancials?: StoreOrderFinancials;

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

/*
|--------------------------------------------------------------------------
| Order Mapper
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Converts checkout data into the application's Order model.
|
| IMPORTANT
| ---------
| This file DOES NOT:
|
| ❌ Save to Firestore
| ❌ Call Shipday
| ❌ Charge Stripe
| ❌ Update Status
|
| It ONLY creates an Order object.
|
*/

import type {
  Order,
  OrderItem,
  OrderStatus,
  StatusHistory,
} from "@/types/order";

import type { CheckoutSubmission } from "@/app/checkout/types";

import {
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase/firestore";

/**
 * Converts Checkout UI data into the shared Order domain model.
 */
export function createOrder(
  input: CheckoutSubmission
): Order {
  const items: OrderItem[] = input.items.map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price,
    quantity: item.quantity,
    imageUrl: item.imageUrl,
    size: item.size ?? null,
  }));

  return {
    /**
     * Firestore and OrderService will populate these values.
     */
    id: "",
    orderNumber: "",

    customer: {
      uid: input.userId,
      name: input.customerName,
      email: input.customerEmail,
      phone: input.customerPhone,
      address:
        input.deliveryAddress.formattedAddress ||
        [
          input.deliveryAddress.street,
          input.deliveryAddress.city,
          input.deliveryAddress.state,
          input.deliveryAddress.zip,
        ]
          .filter(Boolean)
          .join(", "),
      latitude: input.customerLatitude,
      longitude: input.customerLongitude,
    },

    store: {
      id: input.storeId,
      ownerId: input.storeOwnerId,
      name: input.storeName,
      address: input.storeAddress,
      phone: input.storePhone,
      latitude: input.storeLatitude,
      longitude: input.storeLongitude,
    },

    items,

    pricing: {
      subtotal: input.totals.subtotal,
      deliveryFee: input.totals.deliveryFee,
      tax: input.totals.tax,
      tip: input.totals.tip,
      total: input.totals.total,
    },

    delivery: {
      instructions:
        input.deliveryInstructions?.trim() || undefined,
      distanceMiles: input.deliveryDistanceMiles,
      estimatedMinutes:
        input.estimatedDeliveryMinutes,
    },

    status: "pending",

    statusHistory: [],

    payment: {
      status: "pending",
    },

    shipday: {
      status: "pending",
      active: false,
    },

    createdAt: new Date(),
    updatedAt: undefined,
  };
}

/**
 * Convert supported Firestore/date values into a JavaScript Date.
 */
function toDate(
  value: unknown,
  fallback: Date = new Date()
): Date {
  if (value instanceof Date) {
    return value;
  }

  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (
      value as {
        toDate: () => Date;
      }
    ).toDate();
  }

  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    const parsedDate = new Date(value);

    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  }

  return fallback;
}

/**
 * Convert an optional timestamp into a Date when available.
 */
function toOptionalDate(
  value: unknown
): Date | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return toDate(value);
}
/**
 * Converts a Firestore order document into the shared Order domain model.
 */
export function mapFirestoreOrder(
  document: DocumentSnapshot<DocumentData>
): Order {
  const data = document.data();

  if (!data) {
    throw new Error(
      "Order document does not exist."
    );
  }

  const statusHistory: StatusHistory[] = (
    data.statusHistory ?? []
  ).map((history: DocumentData) => ({
    status: history.status as OrderStatus,
    note: history.note ?? undefined,
    timestamp: toDate(history.timestamp),
  }));

  return {
    id: document.id,

    orderNumber: data.orderNumber ?? "",

    customer: data.customer,

    store: data.store,

    items: data.items ?? [],

    pricing: data.pricing,

    delivery: data.delivery,

    status: data.status as OrderStatus,

    cancellationReason: data.cancellationReason ?? undefined,

    payment: data.payment
      ? {
          ...data.payment,
          paidAt: toOptionalDate(
            data.payment.paidAt
          ),
        }
      : undefined,

    shipday: data.shipday
      ? {
          ...data.shipday,
          eta: toOptionalDate(
            data.shipday.eta
          ),
          createdAt: toOptionalDate(
            data.shipday.createdAt
          ),
          lastUpdated: toOptionalDate(
            data.shipday.lastUpdated
          ),
          lastSyncAt: toOptionalDate(
            data.shipday.lastSyncAt
          ),
        }
      : undefined,

    statusHistory,

    createdAt: toDate(data.createdAt),

    updatedAt: toOptionalDate(
      data.updatedAt
    ),
  };
}

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

import type { Order } from "@/types/order";
import type { DocumentSnapshot } from "firebase/firestore";

/**
 * Everything the Checkout page knows.
 *
 * The Checkout page will pass ONE object
 * instead of dozens of individual parameters.
 */
export interface CreateOrderInput {

  userId: string;

  customerName: string;
  customerPhone: string;
  customerEmail: string;

  storeId: string;
  storeName: string;
  storeOwnerId: string;
  storeAddress: string;
  storePhone: string;
  storeLatitude: number;
  storeLongitude: number;

  deliveryAddress: {
    street: string;
    city: string;
    state: string;
    zip: string;
    formattedAddress: string;
  };

  customerLatitude: number;
  customerLongitude: number;

  deliveryInstructions: string;

  deliveryFee: number;
  distanceMiles: number;
  items: Order["items"];

  subtotal: number;
  tax: number;
  tip: number;
  total: number;
}

/**
 * Creates a new Order object.
 */
export function createOrder(
  input: CreateOrderInput
): Order {
return {
  // Firestore will generate this.
  id: "",

  // OrderService will generate this.
  orderNumber: "",

  customer: {
    uid: input.userId,
    name: input.customerName,
    email: input.customerEmail,
    phone: input.customerPhone,
    address: input.deliveryAddress.formattedAddress,
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

  items: input.items,

  pricing: {
    subtotal: input.subtotal,
    deliveryFee: input.deliveryFee,
    tax: input.tax,
    tip: input.tip,
    total: input.total,
  },

  delivery: {
      instructions: input.deliveryInstructions,
      distanceMiles: input.distanceMiles,
    },

  // OrderService decides the initial status.
  status: "pending",

  // These will be set by OrderService.
  createdAt: new Date(),

  updatedAt: undefined,

  payment: {
      status: "pending",
    },

  shipday: {
      status: "pending",
    },

  statusHistory: [],
};
}

/*
|--------------------------------------------------------------------------
| Firestore -> Order Mapper
|--------------------------------------------------------------------------
|
| Converts a Firestore document into our application's Order model.
|
| WHY?
| ----
| Firestore stores raw document data.
|
| Our React components should work with the Order model instead.
|
| This gives us one place to translate Firestore data into the
| application's domain model.
|
*/

/**
 * Converts a Firestore document into an Order.
 */
export function mapFirestoreOrder(
  doc: DocumentSnapshot
): Order {

  const data = doc.data();

  if (!data) {
    throw new Error("Order document does not exist.");
  }

  return {
    id: doc.id,
    orderNumber: data.orderNumber,
    customer: data.customer,
    store: data.store,
    items: data.items,
    pricing: data.pricing,
    delivery: data.delivery,
    status: data.status,
    payment: data.payment,
    shipday: data.shipday,
    statusHistory: (data.statusHistory ?? []).map((history: any) => ({
        status: history.status,
        note: history.note,
        timestamp:
          history.timestamp?.toDate?.() ??
          (history.timestamp instanceof Date
            ? history.timestamp
            : new Date(history.timestamp)),
      })),
    createdAt: data.createdAt?.toDate?.() ?? new Date(),
    updatedAt: data.updatedAt?.toDate?.(),
  };
}
/*
|--------------------------------------------------------------------------
| Order Service
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| This service is the only place responsible for interacting with the
| "orders" collection in Firestore.
|
| React pages should never call Firestore directly.
| Instead, they should call functions in this service.
|
*/

import { getFunctions, httpsCallable } from "firebase/functions";
import { mapOrderToShipday } from "@/mappers/shipdayMapper";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import type { Order } from "@/types/order";
import { mapFirestoreOrder } from "@/mappers/orderMapper";

const functions = getFunctions();
export class OrderService {
  /**
   * Creates a new order in Firestore.
   *
   * @param order
   * The application's Order model.
   *
   * @returns
   * The Firestore document ID.
   */
  /*
 * Saves a new order into Firestore.
 *
 * The Checkout page passes us an Order object.
 * We are responsible for storing it correctly.
 */
async createOrder(order: Order): Promise<string> {

  // Business Rule #1
  // Generate a human-readable order number.
  const orderNumber =
    `LIA-${Date.now()}`;

  // Business Rule #2
  // Every new order starts as pending.
  const status = "pending";

  // Business Rule #3
  // The first entry in the order timeline.
  const statusHistory = [
    {
      status,
      timestamp: new Date(),
      note: "Order created.",
    },
  ];

  const docRef = await addDoc(
    collection(db, "orders"),
    {

      ...order,

      orderNumber,

      status,

      statusHistory,

      createdAt: serverTimestamp(),

      updatedAt: serverTimestamp(),
    }
  );

  return docRef.id;
}

    /**
     * Retrieves a single order from Firestore.
     *
     * The React page does NOT know anything about Firestore.
     * It simply asks the OrderService for an Order.
     */
    async getOrder(
      orderId: string
    ): Promise<Order | null> {

      // Read the Firestore document
      const snapshot = await getDoc(
        doc(db, "orders", orderId)
      );

      // If it doesn't exist, return null
      if (!snapshot.exists()) {
        return null;
      }

      // Convert Firestore document into our Order model
      return mapFirestoreOrder(snapshot);
    }

  /**
   * Updates the status of an existing order.
   */
  async updateStatus(
  orderId: string,
  newStatus: Order["status"]
): Promise<Date> {
    const now = new Date();

    await updateDoc(doc(db, "orders", orderId), {
      status: newStatus,

      updatedAt: serverTimestamp(),

      statusHistory: arrayUnion({
        status: newStatus,

        timestamp: now,

        note: `Order status changed to ${newStatus}`,
      }),
    });



    // ----------------------------------------------------
    // Business Rule
    // Create the Shipday delivery only when the order
    // is ready for pickup.
    // ----------------------------------------------------
    if (newStatus === "ready_for_pickup") {
      const createShipdayOrder = httpsCallable(
        functions,
        "createShipdayOrder"
      );

      const response = await createShipdayOrder({
        orderId,
      });

      console.log(
        "Firebase Function Response:",
        response.data
      );
    }

    return now;
  }


/**
 * Accepts an order.
 *
 * This is the main business workflow for dispatching
 * a delivery to Shipday.
 */
async acceptOrder(
  orderId: string
): Promise<void> {

  // ----------------------------------------------------
  // STEP 1
  // Load the order from Firestore.
  // ----------------------------------------------------
  const order = await this.getOrder(orderId);

  if (!order) {
    throw new Error("Order not found.");
  }

  // ----------------------------------------------------
  // STEP 2
  // Convert our Order model into Shipday's model.
  // ----------------------------------------------------
  const shipdayOrder =
    mapOrderToShipday(order);

  console.log(
    "Shipday Payload:",
    shipdayOrder
  );

 // ----------------------------------------------------
// STEP 3
// Ask our backend to create the Shipday delivery.
// ----------------------------------------------------

const createShipdayOrder = httpsCallable(
  functions,
  "createShipdayOrder"
);

const response = await createShipdayOrder({
  orderId,
});

console.log(
  "Firebase Function Response:",
  response.data
);

  // ----------------------------------------------------
  // STEP 4
  // Update our own order status.
  // ----------------------------------------------------
  await this.updateStatus(
    orderId,
    "accepted"
  );

}

}



/**
 * Singleton instance.
 *
 * The application shares one OrderService.
 */
export const orderService = new OrderService();
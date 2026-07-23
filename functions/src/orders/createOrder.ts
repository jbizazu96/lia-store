/*
|--------------------------------------------------------------------------
| Create Order
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Creates a new customer order.
|
| This is the single entry point for creating orders.
|
| Responsibilities:
|
| • Validate the request
| • Generate the order number
| • Create the initial timeline
| • Save the order
| • Notify the store
|
| Future responsibilities:
|
| • Inventory validation
| • Coupon validation
| • Tax calculation
| • Stripe Checkout
| • Fraud detection
|
*/

import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  getFirestore,
  FieldValue,
  type DocumentReference,
  type DocumentSnapshot,
} from "firebase-admin/firestore";

import { storeEvents } from "../events/storeEvents";

const LOW_STOCK_THRESHOLDS = [
  20,
  15,
  10,
  5,
  0,
] as const;

interface LowStockAlert {
  productId: string;
  productName: string;
  remainingStock: number;
}

export const createOrder = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },

  async (request) => {

    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Authentication required."
      );
    }

    const { order } = request.data;

    if (!order) {
      throw new HttpsError(
        "invalid-argument",
        "Order is required."
      );
    }

    const db =
      getFirestore("default");

    if (!Array.isArray(order.items) || order.items.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "An order must contain at least one product."
      );
    }

    const orderNumber =
      `LIA-${Date.now()}`;

    const orderRef =
      db.collection("orders").doc();

    let storeOwnerUid = "";
    let lowStockAlerts: LowStockAlert[] = [];

    await db.runTransaction(async (transaction) => {
      /*
       * Transactions can retry, so rebuild these values each attempt and
       * dispatch notifications only after the transaction commits.
       */
      lowStockAlerts = [];

      const productReferences: DocumentReference[] = order.items.map((item: {id: string}) =>
        db.collection("products").doc(item.id)
      );

      const productSnapshots: DocumentSnapshot[] = [];

      for (const productReference of productReferences) {
        productSnapshots.push(
          await transaction.get(productReference)
        );
      }

      const storeSnapshot = await transaction.get(
        db.collection("stores").doc(order.store?.id)
      );

      storeOwnerUid =
        typeof storeSnapshot.data()?.ownerId === "string"
          ? storeSnapshot.data()?.ownerId
          : "";

      productSnapshots.forEach((productSnapshot, index) => {
        const orderedItem = order.items[index];
        const orderedQuantity = Number(orderedItem.quantity);

        if (!Number.isInteger(orderedQuantity) || orderedQuantity <= 0) {
          throw new HttpsError(
            "invalid-argument",
            "Each ordered product must have a valid quantity."
          );
        }

        if (!productSnapshot.exists) {
          throw new HttpsError(
            "not-found",
            `${orderedItem.name} is no longer available.`
          );
        }

        const product = productSnapshot.data();
        const availableStock = Number(product?.stock ?? 0);
        const remainingStock =
          availableStock - orderedQuantity;

        if (
          product?.storeId !== order.store?.id ||
          product?.isAvailable === false ||
          availableStock < orderedQuantity
        ) {
          throw new HttpsError(
            "failed-precondition",
            `${orderedItem.name} no longer has enough stock available.`
          );
        }

        transaction.update(productSnapshot.ref, {
          stock: remainingStock,
          updatedAt: FieldValue.serverTimestamp(),
        });

        const crossedThreshold =
          LOW_STOCK_THRESHOLDS.some(
            (threshold) =>
              availableStock > threshold &&
              remainingStock <= threshold
          );

        if (crossedThreshold) {
          lowStockAlerts.push({
            productId: productSnapshot.id,
            productName:
              typeof product?.name === "string" &&
              product.name.trim()
                ? product.name
                : orderedItem.name,
            remainingStock,
          });
        }
      });

      transaction.set(orderRef, {
        ...order,
        orderNumber,
        status: "pending",
        statusHistory: [
          {
            status: "pending",
            timestamp: new Date(),
            note: "Order created.",
          },
        ],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    console.log("Store object:");
console.log(order.store);

console.log("Store owner ID:");
console.log(order.store?.ownerId);

// Notify the store owner
// ----------------------------------------------------
// Notify the store owner.
// ----------------------------------------------------
//
// IMPORTANT:
// Notification failures should NEVER fail checkout.
// The order has already been created successfully.
//
// Push notifications are best-effort.
//
if (storeOwnerUid) {

  console.log("Sending store notification...");

  try {

    await storeEvents.newOrder(
      orderRef.id,
      storeOwnerUid
    );

    console.log(
      "Store notification completed."
    );

  } catch (error) {

    console.error(
      "Store notification failed:",
      error
    );

    // Do NOT throw.
    // The order was successfully created.

  }

} else {

  console.log(
    "Store owner ID not found. Notification skipped."
  );

}

    for (const alert of lowStockAlerts) {
      try {
        await storeEvents.lowStock(
          alert.productId,
          alert.productName,
          alert.remainingStock,
          storeOwnerUid
        );
      } catch (error) {
        console.error(
          "Low-stock notification failed:",
          error
        );
      }
    }

    return {

      success: true,

      orderId: orderRef.id,

      orderNumber,

    };

  }
);

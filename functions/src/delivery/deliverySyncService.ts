/*
|--------------------------------------------------------------------------
| Delivery Sync Service
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Keeps LIA synchronized with external delivery providers.
|
| WHY?
| ----
| During development we will poll Shipday for updates.
|
| Later, this service can also receive updates from:
|
| • Shipday Webhooks
| • Uber Direct
| • DoorDash Drive
| • Roadie
|
| The rest of the application never needs to know where
| the update came from.
|
*/

import {mapShipdayStatus} from "../mappers/shipdayStatusMapper";
import {
  getFirestore,
  FieldValue,
} from "firebase-admin/firestore";
import {shipdayService} from "../services/shipdayService"

/**
 * DeliverySyncService
 *
 * Synchronizes delivery information between LIA
 * and external delivery providers.
 */
export class DeliverySyncService {

  /**
   * Synchronize one delivery.
   *
   * @param orderId
   * Firestore order document ID.
   */

  /**
 * Synchronize all active deliveries
 * for a single customer.
 *
 * @param customerId
 * Firebase Authentication UID.
 */
async syncCustomerOrders(
  customerId: string
): Promise<void> {

  console.log(
    `Synchronizing orders for customer ${customerId}`
  );

  const snapshot = await this.db
    .collection("orders")
    .where("customer.uid", "==", customerId)
    //.where("shipday.active", "==", true)
    .get();

  console.log(
    `Found ${snapshot.size} active customer deliveries.`
  );

  for (const document of snapshot.docs) {

    await this.syncOrder(document.id);

  }

  console.log(
    "Customer delivery synchronization complete."
  );

}

/**
 * Synchronize all active deliveries
 * for a single store.
 *
 * @param storeId
 * Firestore store document ID.
 */

async syncStoreOrders(
  storeId: string
): Promise<void> {

  console.log(
    `Synchronizing orders for store ${storeId}`
  );

console.log("syncStoreOrders() called");

console.log("Store ID:", storeId);

  const snapshot = await this.db
    .collection("orders")
    .where("store.id", "==", storeId)
    .where("shipday.active", "==", true)
    .get();

  console.log(
    `Found ${snapshot.size} active store deliveries.`
  );

  for (const document of snapshot.docs) {

    await this.syncOrder(document.id);

  }

  console.log(
    "Store delivery synchronization complete."
  );

}
  /**
 * Synchronize every active delivery.
 */
async syncActiveDeliveries(): Promise<void> {

  console.log("Starting delivery synchronization...");

  const snapshot = await this.db
    .collection("orders")
    .where("shipday.active", "==", true)
    .get();

  console.log(
    `Found ${snapshot.size} active deliveries.`
  );

  for (const document of snapshot.docs) {

    await this.syncOrder(document.id);

  }

  console.log(
    "Delivery synchronization complete."
  );

}

  private get db() {
      return getFirestore("default");
    }
  async syncOrder(
    orderId: string
  ): Promise<void> {

    console.log(
  `Synchronizing delivery for order ${orderId}`
    );


    // ----------------------------------------------------
    // STEP 1
    // Load the Firestore order.
    // ----------------------------------------------------
    const orderDoc = await this.db
      .collection("orders")
      .doc(orderId)
      .get();

    if (!orderDoc.exists) {
      throw new Error("Order not found.");
    }

    const order = orderDoc.data();

    console.log(
      "Firestore order loaded."
    );

    
    // ----------------------------------------------------
// STEP 2
// Verify this order has a Shipday delivery.
// ----------------------------------------------------
if (!order?.shipday?.orderId) {
  console.log(
    "Order has no Shipday delivery."
  );

  return;
}

// ----------------------------------------------------
// STEP 3
// Load the latest delivery from Shipday.
// ----------------------------------------------------
const shipdayOrder =
  await shipdayService.getOrderDetails(
    order.orderNumber
  );

console.log(
  "Latest Shipday delivery:"
);

console.log(shipdayOrder);

// ----------------------------------------------------
// STEP 4
// Convert Shipday status into LIA status.
// ----------------------------------------------------
const mappedStatus =
  mapShipdayStatus(
    shipdayOrder.orderStatus.orderState
  );

  
console.log(
  "Mapped Shipday status:"
);

console.log(mappedStatus);

// ----------------------------------------------------
// STEP 5
// Skip synchronization if nothing changed.
// ----------------------------------------------------
if (
  order.shipday?.status ===
    mappedStatus.shipdayStatus &&

  order.status ===
    mappedStatus.orderStatus
) {

  console.log(
    "Order already synchronized."
  );

  return;

}
// ----------------------------------------------------
// STEP 5
// Update Firestore with the latest Shipday status.
// ----------------------------------------------------
const now = new Date();

const updateData: Record<string, unknown> = {
  "shipday.status": mappedStatus.shipdayStatus,

  "shipday.lastUpdated": now,

  "shipday.lastSyncAt": now,
};

// If the mapper returned a LIA status,
// update the business status too.
if (mappedStatus.orderStatus) {

  updateData.status = mappedStatus.orderStatus;

  updateData.statusHistory =
    FieldValue.arrayUnion({
      status: mappedStatus.orderStatus,
      timestamp: now,
      note: "Updated from Shipday",
    });

}

// Delivery completed?
// Stop polling this order.
if (
  mappedStatus.shipdayStatus === "delivered" ||
  mappedStatus.shipdayStatus === "cancelled" ||
  mappedStatus.shipdayStatus === "failed"
) {

  updateData["shipday.active"] = false;

}

await orderDoc.ref.update(updateData);

console.log(
  "Firestore synchronized successfully."
);

  }

}

/**
 * Shared singleton.
 */
export const deliverySyncService =
  new DeliverySyncService();
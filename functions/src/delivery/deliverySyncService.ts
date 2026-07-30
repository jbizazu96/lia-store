/*
|--------------------------------------------------------------------------
| Delivery Sync Service
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Keeps LIA synchronized with external delivery providers.
|
| During development, LIA polls Shipday for delivery updates.
|
| Later, the same synchronization layer can receive updates from:
|
| • Shipday webhooks
| • Uber Direct
| • DoorDash Drive
| • Roadie
|
| The rest of the application does not need to know which provider
| supplied the update.
|
*/

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

import {
  mapShipdayStatus,
} from "../mappers/shipdayStatusMapper";

import {
  shipdayService,
} from "../services/shipdayService";


/*
|--------------------------------------------------------------------------
| Shipday Order Shape
|--------------------------------------------------------------------------
|
| Shipday is an external API, so getOrderDetails() returns unknown.
|
| This interface describes only the fields this synchronization service
| currently needs.
|
*/

interface ShipdayOrderDetails {
  orderStatus: {
    orderState: string;
  };

  [key: string]: unknown;
}


/*
|--------------------------------------------------------------------------
| Shipday Response Guard
|--------------------------------------------------------------------------
*/

function isShipdayOrderDetails(
  value: unknown
): value is ShipdayOrderDetails {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const candidate =
    value as {
      orderStatus?: unknown;
    };

  if (
    typeof candidate.orderStatus !==
      "object" ||
    candidate.orderStatus === null
  ) {
    return false;
  }

  const orderStatus =
    candidate.orderStatus as {
      orderState?: unknown;
    };

  return (
    typeof orderStatus.orderState ===
      "string" &&
    Boolean(
      orderStatus.orderState.trim()
    )
  );
}


/*
|--------------------------------------------------------------------------
| Delivery Sync Service
|--------------------------------------------------------------------------
*/

export class DeliverySyncService {
  /*
  |--------------------------------------------------------------------------
  | Firestore
  |--------------------------------------------------------------------------
  */

  private get db() {
    return getFirestore("default");
  }


  /*
  |--------------------------------------------------------------------------
  | Synchronize Customer Orders
  |--------------------------------------------------------------------------
  */

  async syncCustomerOrders(
    customerId: string
  ): Promise<void> {
    console.log(
      `Synchronizing orders for customer ${customerId}`
    );

    const snapshot =
      await this.db
        .collection("orders")
        .where(
          "customer.uid",
          "==",
          customerId
        )
        .get();

    console.log(
      `Found ${snapshot.size} customer orders.`
    );

    for (
      const document of
      snapshot.docs
    ) {
      await this.syncOrder(
        document.id
      );
    }

    console.log(
      "Customer delivery synchronization complete."
    );
  }


  /*
  |--------------------------------------------------------------------------
  | Synchronize Store Orders
  |--------------------------------------------------------------------------
  */

  async syncStoreOrders(
    storeId: string
  ): Promise<void> {
    console.log(
      "syncStoreOrders() called.",
      {
        storeId,
      }
    );

    /*
      Query the store's orders first, then select active Shipday deliveries
      in memory. This avoids requiring a composite index for a best-effort
      synchronization task and keeps one malformed legacy delivery from
      blocking the store orders page.
    */
    const storeOrdersSnapshot =
      await this.db
        .collection("orders")
        .where(
          "store.id",
          "==",
          storeId
        )
        .get();

    const activeDeliveryDocuments =
      storeOrdersSnapshot.docs.filter(
        (document) =>
          document.data().shipday?.active === true
      );

    console.log(
      `Found ${activeDeliveryDocuments.length} active store deliveries.`
    );

    for (
      const document of
      activeDeliveryDocuments
    ) {
      try {
        await this.syncOrder(
          document.id
        );
      } catch (error) {
        /*
          Shipday synchronization is informational at page-load time. The
          store must still be able to open and manage every confirmed order
          when one provider record is unavailable or malformed.
        */
        console.error(
          "Unable to synchronize store delivery; continuing with remaining orders.",
          {
            orderId: document.id,
            error,
          }
        );
      }
    }

    console.log(
      "Store delivery synchronization complete."
    );
  }


  /*
  |--------------------------------------------------------------------------
  | Synchronize Every Active Delivery
  |--------------------------------------------------------------------------
  */

  async syncActiveDeliveries(): Promise<void> {
    console.log(
      "Starting delivery synchronization..."
    );

    const snapshot =
      await this.db
        .collection("orders")
        .where(
          "shipday.active",
          "==",
          true
        )
        .get();

    console.log(
      `Found ${snapshot.size} active deliveries.`
    );

    for (
      const document of
      snapshot.docs
    ) {
      await this.syncOrder(
        document.id
      );
    }

    console.log(
      "Delivery synchronization complete."
    );
  }


  /*
  |--------------------------------------------------------------------------
  | Synchronize One Order
  |--------------------------------------------------------------------------
  */

  async syncOrder(
    orderId: string
  ): Promise<void> {
    console.log(
      `Synchronizing delivery for order ${orderId}`
    );

    /*
      Step 1:
      Load the Firestore order.
    */
    const orderDoc =
      await this.db
        .collection("orders")
        .doc(orderId)
        .get();

    if (!orderDoc.exists) {
      throw new Error(
        "Order not found."
      );
    }

    const order =
      orderDoc.data();

    if (!order) {
      throw new Error(
        "Order data is missing."
      );
    }

    /*
      Step 2:
      Verify that the order has a Shipday delivery.
    */
    if (!order.shipday?.orderId) {
      console.log(
        "Order has no Shipday delivery."
      );

      return;
    }

    if (
      typeof order.orderNumber !==
        "string" ||
      !order.orderNumber.trim()
    ) {
      throw new Error(
        "The order does not have a valid order number."
      );
    }

    /*
      Step 3:
      Load the latest delivery information from Shipday.
    */
    const rawShipdayOrder =
      await shipdayService
        .getOrderDetails(
          order.orderNumber
        );

    if (
      !isShipdayOrderDetails(
        rawShipdayOrder
      )
    ) {
      throw new Error(
        "Shipday returned an invalid order-details response."
      );
    }

    const shipdayOrder =
      rawShipdayOrder;

    const shipdayOrderState =
      shipdayOrder
        .orderStatus
        .orderState
        .trim();

    console.log(
      "Latest Shipday delivery:",
      shipdayOrder
    );

    console.log(
      "Shipday order state:",
      shipdayOrderState
    );

    /*
      Step 4:
      Convert the Shipday state into LIA statuses.
    */
    const mappedStatus =
      mapShipdayStatus(
        shipdayOrderState
      );

    console.log(
      "Mapped Shipday status:",
      mappedStatus
    );

    /*
      Step 5:
      Skip the Firestore update when nothing changed.
    */
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

    /*
      Step 6:
      Prepare the Firestore update.
    */
    const now =
      new Date();

    const updateData:
      Record<string, unknown> = {
        "shipday.status":
          mappedStatus.shipdayStatus,

        "shipday.lastUpdated":
          now,

        "shipday.lastSyncAt":
          now,
      };

    /*
      Update the LIA business status only when the mapper returns one.
    */
    if (
      mappedStatus.orderStatus
    ) {
      updateData.status =
        mappedStatus.orderStatus;

      updateData.statusHistory =
        FieldValue.arrayUnion({
          status:
            mappedStatus.orderStatus,

          timestamp:
            now,

          note:
            "Updated from Shipday",
        });
    }

    /*
      Stop polling terminal deliveries.
    */
    if (
      mappedStatus.shipdayStatus ===
        "delivered" ||
      mappedStatus.shipdayStatus ===
        "cancelled" ||
      mappedStatus.shipdayStatus ===
        "failed"
    ) {
      updateData[
        "shipday.active"
      ] = false;
    }

    await orderDoc.ref.update(
      updateData
    );

    console.log(
      "Firestore synchronized successfully."
    );
  }
}


/*
|--------------------------------------------------------------------------
| Shared Service
|--------------------------------------------------------------------------
*/

export const deliverySyncService =
  new DeliverySyncService();

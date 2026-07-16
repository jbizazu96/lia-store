/*
|--------------------------------------------------------------------------
| Create Shipday Order
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Creates a delivery in Shipday.
|
| This function runs on the server, so our Shipday API key
| is never exposed to the browser.
|
*/
import { mapOrderToShipday } from "../mappers/shipdayMapper";
import { shipdayService } from "../services/shipdayService";
import { onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Creates a Shipday delivery.
 *
 * For now we are only verifying that the function
 * is connected correctly.
 */

export const createShipdayOrder = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
    secrets: ["SHIPDAY_API_KEY", "SHIPDAY_API_URL"],
  },
async (request) => {

    const { orderId } = request.data;
    const db = getFirestore("default");
    console.log("✅ createShipdayOrder() called.");
    console.log("Order ID:", orderId);

    // Read the order from Firestore
    const orderDoc = await db
      .collection("orders")
      .doc(orderId)
      .get();

    if (!orderDoc.exists) {
      throw new Error("Order not found.");
    }

    const order = orderDoc.data();
    const shipdayOrder =
      mapOrderToShipday({
        id: orderDoc.id,
        ...order,
      });

    console.log("Shipday Payload:");
    console.log(shipdayOrder);

    const shipdayResponse =
    await shipdayService.createOrder(shipdayOrder);

    console.log("Shipday Response:");
    console.log(shipdayResponse);

    await orderDoc.ref.update({
    shipday: {

        orderId: shipdayResponse.orderId,
        status: "created",
        active: true,

        createdAt: new Date(),
        lastUpdated: new Date(),
        lastSyncAt: new Date(),

        trackingUrl: shipdayResponse.trackingUrl,
        driverName: shipdayResponse.driverName,
        driverPhone: shipdayResponse.driverPhone,
        eta: shipdayResponse.eta,
        
          },
    });

    console.log("Firestore Order:");
    console.log(order);

     console.log("Shipday Payload:");
    console.log(shipdayOrder);

    return {
      success: true,
      message: "Shipday delivery created successfully.",

      shipday: {
        orderId: shipdayResponse.orderId,
        status: "created",
      },
    };

  }
);
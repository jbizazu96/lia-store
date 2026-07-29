/*
|--------------------------------------------------------------------------
| Create Shipday Order
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Creates a delivery in Shipday.
|
| This function runs on the server, so the Shipday API key
| is never exposed to the browser.
|
| IMPORTANT
| ---------
| The main production order-status workflow now creates Shipday deliveries
| through shipdayFulfillmentService.
|
| This callable remains available for direct testing, but it must still
| safely validate Shipday's external API response.
|
*/

import {
  getFirestore,
} from "firebase-admin/firestore";

import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  mapOrderToShipday,
} from "../mappers/shipdayMapper";

import {
  shipdayService,
} from "../services/shipdayService";


/*
|--------------------------------------------------------------------------
| Shipday Response Shape
|--------------------------------------------------------------------------
*/

interface ShipdayCreationResponse {
  orderId?: string | number;

  trackingUrl?: string;

  driverName?: string;

  driverPhone?: string;

  eta?: string;

  [key: string]: unknown;
}


/*
|--------------------------------------------------------------------------
| Response Guard
|--------------------------------------------------------------------------
*/

function isShipdayCreationResponse(
  value: unknown
): value is ShipdayCreationResponse {
  return (
    typeof value === "object" &&
    value !== null
  );
}


/*
|--------------------------------------------------------------------------
| Read Shipday Order ID
|--------------------------------------------------------------------------
*/

function readShipdayOrderId(
  value: unknown
): string {
  if (
    typeof value === "string" &&
    value.trim()
  ) {
    return value.trim();
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return String(value);
  }

  throw new HttpsError(
    "internal",
    "Shipday did not return a valid order ID."
  );
}


/*
|--------------------------------------------------------------------------
| Callable
|--------------------------------------------------------------------------
*/

export const createShipdayOrder =
  onCall(
    {
      region:
        "us-central1",

      maxInstances:
        10,

      secrets: [
        "SHIPDAY_API_KEY",
        "SHIPDAY_API_URL",
      ],
    },

    async (
      request
    ) => {
      const rawOrderId =
        request.data?.orderId;

      if (
        typeof rawOrderId !==
          "string" ||
        !rawOrderId.trim()
      ) {
        throw new HttpsError(
          "invalid-argument",
          "Order ID is required."
        );
      }

      const orderId =
        rawOrderId.trim();

      const db =
        getFirestore("default");

      console.log(
        "createShipdayOrder() called.",
        {
          orderId,
        }
      );

      /*
        Read the trusted order document from Firestore.
      */
      const orderDoc =
        await db
          .collection("orders")
          .doc(orderId)
          .get();

      if (!orderDoc.exists) {
        throw new HttpsError(
          "not-found",
          "Order not found."
        );
      }

      const order =
        orderDoc.data();

      const shipdayOrder =
        mapOrderToShipday({
          id:
            orderDoc.id,

          ...order,
        });

      console.log(
        "Shipday payload:",
        shipdayOrder
      );

      const rawShipdayResponse =
        await shipdayService
          .createOrder(
            shipdayOrder
          );

      if (
        !isShipdayCreationResponse(
          rawShipdayResponse
        )
      ) {
        throw new HttpsError(
          "internal",
          "Shipday returned an invalid response."
        );
      }

      const shipdayResponse =
        rawShipdayResponse;

      const shipdayOrderId =
        readShipdayOrderId(
          shipdayResponse.orderId
        );

      console.log(
        "Shipday response:",
        shipdayResponse
      );

      await orderDoc.ref.update({
        shipday: {
          orderId:
            shipdayOrderId,

          status:
            "created",

          active:
            true,

          createdAt:
            new Date(),

          lastUpdated:
            new Date(),

          lastSyncAt:
            new Date(),

          trackingUrl:
            shipdayResponse
              .trackingUrl ??
            null,

          driverName:
            shipdayResponse
              .driverName ??
            null,

          driverPhone:
            shipdayResponse
              .driverPhone ??
            null,

          eta:
            shipdayResponse
              .eta ??
            null,
        },
      });

      return {
        success:
          true,

        message:
          "Shipday delivery created successfully.",

        shipday: {
          orderId:
            shipdayOrderId,

          status:
            "created",
        },
      };
    }
  );
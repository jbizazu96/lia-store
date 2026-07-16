/*
|--------------------------------------------------------------------------
| Shipday Webhook
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Receives webhook events from Shipday.
|
| Shipday notifies us whenever something changes, such as:
|
| • Driver assigned
| • Driver started delivery
| • Order picked up
| • Order on the way
| • Order delivered
|
| This function will eventually update Firestore so the
| customer and store dashboards stay synchronized.
|
*/

import { onRequest } from "firebase-functions/v2/https";

export const shipdayWebhook = onRequest(
  {
    region: "us-central1",
  },
  async (request, response) => {

    console.log("================================");
    console.log("SHIPDAY WEBHOOK RECEIVED");
    console.log("================================");

    console.log("Method:", request.method);

    console.log("Headers:");
    console.log(request.headers);

    console.log("Body:");
    console.log(request.body);

    response.status(200).json({
      success: true,
      message: "Webhook received successfully.",
    });

  }
);
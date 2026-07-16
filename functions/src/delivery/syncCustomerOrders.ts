/*
|--------------------------------------------------------------------------
| Sync Customer Orders
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Synchronizes all active deliveries for the currently
| authenticated customer.
|
| The frontend calls this function whenever the
| customer opens the "My Orders" page.
|
| This function DOES NOT contain business logic.
|
| It simply:
|   1. Verifies the user.
|   2. Calls DeliverySyncService.
|
*/

import { onCall, HttpsError } from "firebase-functions/v2/https";

import { deliverySyncService } from "./deliverySyncService";

export const syncCustomerOrders = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
    secrets: [
      "SHIPDAY_API_KEY",
      "SHIPDAY_API_URL",
    ],
  },

  async (request) => {

    // User must be authenticated.
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Authentication required."
      );
    }

    const customerId = request.auth.uid;

    await deliverySyncService.syncCustomerOrders(
      customerId
    );

    return {
      success: true,
      message: "Customer orders synchronized.",
    };

  }
);
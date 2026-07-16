/*
|--------------------------------------------------------------------------
| Sync Shipday Deliveries Scheduler
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Periodically synchronizes every active Shipday delivery.
|
| During development we use polling instead of Shipday webhooks.
|
| Only orders with shipday.active == true are checked.
|
| Any status changes are written to Firestore.
|
| The Firestore trigger (orderStatusChanged) then handles:
|
| • Notifications
| • Timeline updates
| • Customer UI
| • Store UI
|
| Later, this scheduler can be disabled once Shipday webhooks
| are enabled.
|
*/

import { onSchedule } from "firebase-functions/v2/scheduler";

import { deliverySyncService } from "../delivery/deliverySyncService";

export const syncShipdayDeliveries = onSchedule(
  {
    schedule: "every 2 minutes",
    region: "us-central1",
    timeZone: "America/Chicago",
    secrets: [
      "SHIPDAY_API_KEY",
      "SHIPDAY_API_URL",
    ],
  },

  async () => {

    console.log(
      "Starting scheduled Shipday synchronization..."
    );

    await deliverySyncService.syncActiveDeliveries();

    console.log(
      "Scheduled Shipday synchronization completed."
    );

  }
);
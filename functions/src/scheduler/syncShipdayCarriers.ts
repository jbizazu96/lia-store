/*
|--------------------------------------------------------------------------
| Sync Shipday Carriers Scheduler
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Periodically synchronizes approved LIA drivers with Shipday.
|
| Shipday is the source of truth for:
|
| - Carrier active state
| - Carrier on-shift state
| - Current carrier location
| - Carrier photo
|
| Firestore stores the synchronized read model used by:
|
| - Driver dashboard
| - Admin driver management
| - Admin live map
| - Future customer delivery tracking
|
*/

import {
  onSchedule,
} from "firebase-functions/v2/scheduler";

import {
  carrierSyncService,
} from "../services/shipday/carrierSyncService";

export const syncShipdayCarriers =
  onSchedule(
    {
      schedule:
        "every 2 minutes",

      region:
        "us-central1",

      timeZone:
        "America/Chicago",

      secrets: [
        "SHIPDAY_API_KEY",
        "SHIPDAY_API_URL",
      ],
    },

    async () => {
      console.log(
        "Starting scheduled Shipday carrier synchronization..."
      );

      await carrierSyncService
        .syncApprovedDrivers();

      console.log(
        "Scheduled Shipday carrier synchronization completed."
      );
    }
  );
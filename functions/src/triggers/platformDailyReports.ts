/*
|--------------------------------------------------------------------------
| Platform Daily Reporting Triggers
|--------------------------------------------------------------------------
|
| These triggers maintain small aggregate records. The report service owns
| idempotency, so retry delivery cannot inflate metrics.
|
*/

import {
  onDocumentCreated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import {
  recordCustomerDailyReport,
  synchronizeStoreCustomerRelationship,
  synchronizeOrderDailyReport,
} from "../reporting/platformDailyReportService";

export const platformOrderDailyReport = onDocumentWritten(
  {
    document: "orders/{orderId}",
    region: "us-central1",
    database: "default",
  },
  async (event) => {
    const after = event.data?.after.exists
      ? event.data.after.data() as Record<string, unknown>
      : null;
    await Promise.all([
      synchronizeOrderDailyReport(event.params.orderId, after),
      synchronizeStoreCustomerRelationship(event.params.orderId, after),
    ]);
  }
);

export const platformCustomerDailyReport = onDocumentCreated(
  {
    document: "users/{userId}",
    region: "us-central1",
    database: "default",
  },
  async (event) => {
    const data = event.data?.data() as Record<string, unknown> | undefined;
    if (!data || data.accountType !== "customer") return;
    await recordCustomerDailyReport(event.params.userId, data);
  }
);

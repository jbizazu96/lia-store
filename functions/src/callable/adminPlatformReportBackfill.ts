/*
|--------------------------------------------------------------------------
| Admin Platform Report Backfill
|--------------------------------------------------------------------------
|
| Replays existing source documents through the same idempotent contribution
| service used by live triggers. This safely initializes reports created
| before the daily-reporting pipeline was deployed.
|
*/

import * as admin from "firebase-admin";
import {
  getFirestore,
} from "firebase-admin/firestore";
import {
  onCall,
} from "firebase-functions/v2/https";
import {
  requireActiveAdmin,
} from "../admin/adminAuthorizationService";
import {
  writeAdminAuditLog,
} from "../admin/adminAuditLogService";
import {
  recordCustomerDailyReport,
  synchronizeOrderDailyReport,
} from "../reporting/platformDailyReportService";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");
const MAX_BACKFILL_DOCUMENTS = 1_000;
const CONCURRENCY = 20;

async function inBatches<T>(
  values: T[],
  action: (value: T) => Promise<void>
): Promise<void> {
  for (let offset = 0; offset < values.length; offset += CONCURRENCY) {
    await Promise.all(values.slice(offset, offset + CONCURRENCY).map(action));
  }
}

export const backfillAdminPlatformDailyReports = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (request) => {
    const administrator = await requireActiveAdmin(request);
    const [orders, customers] = await Promise.all([
      db.collection("orders").limit(MAX_BACKFILL_DOCUMENTS).get(),
      db.collection("users")
        .where("accountType", "==", "customer")
        .limit(MAX_BACKFILL_DOCUMENTS)
        .get(),
    ]);

    await inBatches(orders.docs, async (document) => {
      await synchronizeOrderDailyReport(document.id, document.data());
    });
    await inBatches(customers.docs, async (document) => {
      await recordCustomerDailyReport(document.id, document.data());
    });

    const limited = orders.size === MAX_BACKFILL_DOCUMENTS ||
      customers.size === MAX_BACKFILL_DOCUMENTS;

    await writeAdminAuditLog(administrator, {
      action: "platform_daily_reports_backfilled",
      targetType: "platform_report",
      targetId: "daily",
      details: {
        ordersScanned: orders.size,
        customersScanned: customers.size,
        limited,
      },
    });

    return {
      success: true,
      ordersScanned: orders.size,
      customersScanned: customers.size,
      limited,
    };
  }
);

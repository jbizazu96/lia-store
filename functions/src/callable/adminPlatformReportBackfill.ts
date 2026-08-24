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
  requireAdminPermission,
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
    const administrator = await requireAdminPermission(request, "reports", "write");
    const input = request.data && typeof request.data === "object" ? request.data as Record<string, unknown> : {};
    const orderCursor = typeof input.orderCursor === "string" ? input.orderCursor : "";
    const customerCursor = typeof input.customerCursor === "string" ? input.customerCursor : "";
    const ordersDone = input.ordersDone === true;
    const customersDone = input.customersDone === true;
    let orderQuery = db.collection("orders").orderBy(admin.firestore.FieldPath.documentId()).limit(MAX_BACKFILL_DOCUMENTS);
    let customerQuery = db.collection("users").where("accountType", "==", "customer").orderBy(admin.firestore.FieldPath.documentId()).limit(MAX_BACKFILL_DOCUMENTS);
    if (orderCursor) orderQuery = orderQuery.startAfter(orderCursor);
    if (customerCursor) customerQuery = customerQuery.startAfter(customerCursor);
    const [orders, customers] = await Promise.all([
      ordersDone ? Promise.resolve({docs: [], size: 0} as unknown as FirebaseFirestore.QuerySnapshot) : orderQuery.get(),
      customersDone ? Promise.resolve({docs: [], size: 0} as unknown as FirebaseFirestore.QuerySnapshot) : customerQuery.get(),
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
      nextOrderCursor: orders.size === MAX_BACKFILL_DOCUMENTS ? orders.docs.at(-1)?.id ?? null : null,
      nextCustomerCursor: customers.size === MAX_BACKFILL_DOCUMENTS ? customers.docs.at(-1)?.id ?? null : null,
    };
  }
);

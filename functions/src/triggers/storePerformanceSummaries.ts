import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {synchronizeStorePerformanceSummary} from "../reporting/storePerformanceSummaryService";

export const storeSettlementPerformanceSummarySync = onDocumentWritten(
  {document: "paymentSettlements/{orderId}", region: "us-central1", database: "default"},
  async (event) => synchronizeStorePerformanceSummary(event.params.orderId),
);

export const storeRefundPerformanceSummarySync = onDocumentWritten(
  {document: "paymentRefunds/{refundId}", region: "us-central1", database: "default"},
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    const orderIds = [...new Set([before?.orderId, after?.orderId].filter((value): value is string => typeof value === "string" && value.length > 0))];
    await Promise.all(orderIds.map(synchronizeStorePerformanceSummary));
  },
);

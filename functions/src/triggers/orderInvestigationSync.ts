/*
|--------------------------------------------------------------------------
| Order Investigation Projection Triggers
|--------------------------------------------------------------------------
|
| Keep the store-visible investigation projection synchronized whenever a
| private customer case or its related refund changes.
|
*/

import {
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import {
  syncOrderInvestigation,
} from "../services/order/orderInvestigationService";

function orderId(
  data: Record<string, unknown> | undefined
): string {
  return typeof data?.orderId === "string"
    ? data.orderId.trim()
    : "";
}

export const refundClaimOrderInvestigationSync = onDocumentWritten(
  {
    document: "refundClaims/{claimId}",
    region: "us-central1",
    database: "default",
  },
  async (event) => {
    await syncOrderInvestigation(
      orderId(event.data?.after.data() ?? event.data?.before.data())
    );
  }
);

export const orderSupportOrderInvestigationSync = onDocumentWritten(
  {
    document: "orderSupportRequests/{requestId}",
    region: "us-central1",
    database: "default",
  },
  async (event) => {
    await syncOrderInvestigation(
      orderId(event.data?.after.data() ?? event.data?.before.data())
    );
  }
);

export const paymentRefundOrderInvestigationSync = onDocumentWritten(
  {
    document: "paymentRefunds/{refundId}",
    region: "us-central1",
    database: "default",
  },
  async (event) => {
    await syncOrderInvestigation(
      orderId(event.data?.after.data() ?? event.data?.before.data())
    );
  }
);

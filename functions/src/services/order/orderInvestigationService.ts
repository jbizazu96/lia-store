/*
|--------------------------------------------------------------------------
| Order Investigation Projection
|--------------------------------------------------------------------------
|
| Customer refund claims and support reports are private records. Store
| owners need only a small operational signal on their order: whether LIA is
| currently investigating something and the non-sensitive case status. This
| projection deliberately never copies customer or admin messages.
|
*/

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

const db = getFirestore("default");

type Data = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function latestStatus(
  documents: FirebaseFirestore.QueryDocumentSnapshot[]
): string | null {
  if (documents.length === 0) {
    return null;
  }

  const latest = [...documents].sort((left, right) => {
    const leftData = left.data() as Data;
    const rightData = right.data() as Data;
    const leftTime = leftData.updatedAt instanceof Date
      ? leftData.updatedAt.getTime()
      : typeof (leftData.updatedAt as { toMillis?: unknown })?.toMillis === "function"
        ? (leftData.updatedAt as { toMillis: () => number }).toMillis()
        : 0;
    const rightTime = rightData.updatedAt instanceof Date
      ? rightData.updatedAt.getTime()
      : typeof (rightData.updatedAt as { toMillis?: unknown })?.toMillis === "function"
        ? (rightData.updatedAt as { toMillis: () => number }).toMillis()
        : 0;

    return rightTime - leftTime;
  })[0];

  return text(latest.data().status) || null;
}

function refundClaimIsActive(
  claimStatus: string | null,
  refundStatus: string | null
): boolean {
  if (!claimStatus || claimStatus === "rejected") {
    return false;
  }

  return ![
    "completed",
    "partially_completed",
    "cancelled",
    "failed",
  ].includes(refundStatus ?? "");
}

function supportReportIsActive(
  supportStatus: string | null
): boolean {
  return Boolean(
    supportStatus &&
    supportStatus !== "resolved"
  );
}

export async function syncOrderInvestigation(
  orderId: string
): Promise<void> {
  if (!orderId) {
    return;
  }

  const orderReference = db.collection("orders").doc(orderId);
  const [order, refundClaims, supportRequests] = await Promise.all([
    orderReference.get(),
    db.collection("refundClaims")
      .where("orderId", "==", orderId)
      .limit(10)
      .get(),
    db.collection("orderSupportRequests")
      .where("orderId", "==", orderId)
      .limit(10)
      .get(),
  ]);

  if (!order.exists) {
    return;
  }

  const refundClaimStatus = latestStatus(refundClaims.docs);
  const supportRequestStatus = latestStatus(supportRequests.docs);
  const latestRefundClaim = refundClaims.docs.find(
    (document) => text(document.data().status) === refundClaimStatus
  );
  const refundId = text(latestRefundClaim?.data().refundId);
  const refund = refundId
    ? await db.collection("paymentRefunds").doc(refundId).get()
    : null;
  const refundStatus = refund?.exists
    ? text(refund.data()?.status) || null
    : null;

  const hasRefundClaim = refundClaims.size > 0;
  const hasSupportReport = supportRequests.size > 0;

  await orderReference.set({
    liaInvestigation: {
      active: refundClaimIsActive(
        refundClaimStatus,
        refundStatus
      ) || supportReportIsActive(supportRequestStatus),
      hasRefundClaim,
      refundClaimStatus,
      refundStatus,
      hasSupportReport,
      supportRequestStatus,
      updatedAt: FieldValue.serverTimestamp(),
    },
  }, {
    merge: true,
  });
}

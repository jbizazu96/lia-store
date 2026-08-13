/*
|--------------------------------------------------------------------------
| Order Mapper
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Converts Firestore order documents into the application's Order model.
|
| IMPORTANT
| ---------
| This file DOES NOT:
|
| ❌ Save to Firestore
| ❌ Call Shipday
| ❌ Charge Stripe
| ❌ Update Status
|
| It only maps trusted persisted order data.
|
*/

import type {
  Order,
  OrderInvestigation,
  OrderStatus,
  StatusHistory,
} from "@/types/order";

import {
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase/firestore";

/**
 * Convert supported Firestore/date values into a JavaScript Date.
 */
function toDate(
  value: unknown,
  fallback: Date = new Date()
): Date {
  if (value instanceof Date) {
    return value;
  }

  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (
      value as {
        toDate: () => Date;
      }
    ).toDate();
  }

  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    const parsedDate = new Date(value);

    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  }

  return fallback;
}

/**
 * Convert an optional timestamp into a Date when available.
 */
function toOptionalDate(
  value: unknown
): Date | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return toDate(value);
}
/**
 * Converts a Firestore order document into the shared Order domain model.
 */
export function mapFirestoreOrder(
  document: DocumentSnapshot<DocumentData>
): Order {
  const data = document.data();

  if (!data) {
    throw new Error(
      "Order document does not exist."
    );
  }

  return mapOrderData(document.id, data);
}

/** Maps the serialized order returned by callable pagination endpoints. */
export function mapOrderData(id: string, data: DocumentData): Order {
  const statusHistory: StatusHistory[] = (
    data.statusHistory ?? []
  ).map((history: DocumentData) => ({
    status: history.status as OrderStatus,
    note: history.note ?? undefined,
    timestamp: toDate(history.timestamp),
  }));

  const investigation = data.liaInvestigation &&
    typeof data.liaInvestigation === "object" &&
    !Array.isArray(data.liaInvestigation)
    ? data.liaInvestigation as DocumentData
    : null;

  const liaInvestigation: OrderInvestigation | undefined = investigation
    ? {
      active: investigation.active === true,
      hasRefundClaim: investigation.hasRefundClaim === true,
      refundClaimStatus:
        typeof investigation.refundClaimStatus === "string"
          ? investigation.refundClaimStatus
          : null,
      refundStatus:
        typeof investigation.refundStatus === "string"
          ? investigation.refundStatus
          : null,
      hasSupportReport: investigation.hasSupportReport === true,
      supportRequestStatus:
        typeof investigation.supportRequestStatus === "string"
          ? investigation.supportRequestStatus
          : null,
      updatedAt: toOptionalDate(investigation.updatedAt),
    }
    : undefined;

  return {
    id,

    orderNumber: data.orderNumber ?? "",

    customer: data.customer,

    store: data.store,

    items: data.items ?? [],

    pricing: data.pricing,

    delivery: data.delivery,

    status: data.status as OrderStatus,

    cancellationReason: data.cancellationReason ?? undefined,

    liaInvestigation,

    payment: data.payment
      ? {
          ...data.payment,
          paidAt: toOptionalDate(
            data.payment.paidAt
          ),
        }
      : undefined,

    storeFinancials: data.storeFinancials ?? undefined,

    shipday: data.shipday
      ? {
          ...data.shipday,
          eta: toOptionalDate(
            data.shipday.eta
          ),
          createdAt: toOptionalDate(
            data.shipday.createdAt
          ),
          lastUpdated: toOptionalDate(
            data.shipday.lastUpdated
          ),
          lastSyncAt: toOptionalDate(
            data.shipday.lastSyncAt
          ),
        }
      : undefined,

    statusHistory,

    createdAt: toDate(data.createdAt),

    updatedAt: toOptionalDate(
      data.updatedAt
    ),
  };
}

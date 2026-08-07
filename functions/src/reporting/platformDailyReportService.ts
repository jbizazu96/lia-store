/*
|--------------------------------------------------------------------------
| Platform Daily Report Service
|--------------------------------------------------------------------------
|
| Turns event-driven marketplace activity into compact UTC daily aggregates.
| A per-source contribution record makes Firestore-trigger retries safe and
| lets an order status correction reverse its previous daily contribution.
|
*/

import * as admin from "firebase-admin";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");

type Data = Record<string, unknown>;
type OutcomeStatus = "delivered" | "cancelled" | null;

interface OrderContribution {
  confirmedDay: string | null;
  grossCustomerPayments: number;
  outcomeDay: string | null;
  outcomeStatus: OutcomeStatus;
}

function record(value: unknown): Data {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Data
    : {};
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asDate(value: unknown): Date | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const result = value.toDate();
    return result instanceof Date ? result : null;
  }

  if (typeof value === "string") {
    const result = new Date(value);
    return Number.isNaN(result.getTime()) ? null : result;
  }

  return null;
}

function utcDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function historyOutcomeDate(data: Data, status: string): Date | null {
  if (!Array.isArray(data.statusHistory)) return null;

  const event = [...data.statusHistory]
    .reverse()
    .map(record)
    .find((item) => text(item.status) === status);

  return event ? asDate(event.timestamp) : null;
}

function orderContribution(data: Data): OrderContribution {
  const payment = record(data.payment);
  const pricing = record(data.pricing);
  const paid = data.checkoutStatus === "confirmed" && payment.status === "paid";

  if (!paid) {
    return {
      confirmedDay: null,
      grossCustomerPayments: 0,
      outcomeDay: null,
      outcomeStatus: null,
    };
  }

  const confirmedAt = asDate(payment.paidAt) ?? asDate(data.createdAt);
  const status = text(data.status);
  const outcomeStatus: OutcomeStatus = status === "cancelled"
    ? "cancelled"
    : status === "completed" || status === "delivered"
      ? "delivered"
      : null;
  const outcomeAt = outcomeStatus
    ? historyOutcomeDate(data, status) ?? asDate(data.updatedAt) ?? confirmedAt
    : null;

  return {
    confirmedDay: confirmedAt ? utcDay(confirmedAt) : null,
    grossCustomerPayments: Math.max(0, number(pricing.totalAmount)),
    outcomeDay: outcomeAt ? utcDay(outcomeAt) : null,
    outcomeStatus,
  };
}

function savedContribution(data: Data): OrderContribution {
  const outcome = text(data.outcomeStatus);

  return {
    confirmedDay: text(data.confirmedDay) || null,
    grossCustomerPayments: Math.max(0, number(data.grossCustomerPayments)),
    outcomeDay: text(data.outcomeDay) || null,
    outcomeStatus: outcome === "delivered" || outcome === "cancelled"
      ? outcome
      : null,
  };
}

function sameContribution(
  left: OrderContribution,
  right: OrderContribution
): boolean {
  return left.confirmedDay === right.confirmedDay &&
    left.grossCustomerPayments === right.grossCustomerPayments &&
    left.outcomeDay === right.outcomeDay &&
    left.outcomeStatus === right.outcomeStatus;
}

function incrementReport(
  transaction: FirebaseFirestore.Transaction,
  date: string,
  changes: Record<string, number>
): void {
  const reference = db.collection("platformDailyReports").doc(date);
  const increments = Object.fromEntries(
    Object.entries(changes)
      .filter(([, value]) => value !== 0)
      .map(([key, value]) => [key, FieldValue.increment(value)])
  );

  if (Object.keys(increments).length === 0) return;

  transaction.set(reference, {
    date,
    ...increments,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

function applyContributionDelta(
  transaction: FirebaseFirestore.Transaction,
  previous: OrderContribution,
  next: OrderContribution
): void {
  if (previous.confirmedDay) {
    incrementReport(transaction, previous.confirmedDay, {
      confirmedOrders: -1,
      grossCustomerPayments: -previous.grossCustomerPayments,
    });
  }

  if (previous.outcomeDay && previous.outcomeStatus) {
    incrementReport(transaction, previous.outcomeDay, {
      [previous.outcomeStatus === "delivered" ? "deliveredOrders" : "cancelledOrders"]: -1,
    });
  }

  if (next.confirmedDay) {
    incrementReport(transaction, next.confirmedDay, {
      confirmedOrders: 1,
      grossCustomerPayments: next.grossCustomerPayments,
    });
  }

  if (next.outcomeDay && next.outcomeStatus) {
    incrementReport(transaction, next.outcomeDay, {
      [next.outcomeStatus === "delivered" ? "deliveredOrders" : "cancelledOrders"]: 1,
    });
  }
}

export async function synchronizeOrderDailyReport(
  orderId: string,
  data: Data | null
): Promise<void> {
  const contributionReference = db.collection("platformReportContributions")
    .doc("order_" + orderId);
  const next = data ? orderContribution(data) : {
    confirmedDay: null,
    grossCustomerPayments: 0,
    outcomeDay: null,
    outcomeStatus: null,
  };

  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(contributionReference);
    const previous = existing.exists
      ? savedContribution(existing.data() ?? {})
      : {confirmedDay: null, grossCustomerPayments: 0, outcomeDay: null, outcomeStatus: null};

    if (sameContribution(previous, next)) return;

    applyContributionDelta(transaction, previous, next);
    transaction.set(contributionReference, {
      kind: "order",
      ...next,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

export async function recordCustomerDailyReport(
  customerId: string,
  data: Data
): Promise<void> {
  const createdAt = asDate(data.createdAt) ?? new Date();
  const date = utcDay(createdAt);
  const contributionReference = db.collection("platformReportContributions")
    .doc("customer_" + customerId);

  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(contributionReference);
    if (existing.exists) return;

    incrementReport(transaction, date, {newCustomers: 1});
    transaction.create(contributionReference, {
      kind: "customer",
      date,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

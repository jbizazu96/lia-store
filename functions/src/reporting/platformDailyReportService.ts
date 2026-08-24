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
  pricingZoneId: string | null;
  pricingZoneName: string;
  routeMiles: number;
  orderZoneException: boolean;
  crossZoneDelivery: boolean;
  peakSurchargeAmount: number;
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
      pricingZoneId: null, pricingZoneName: "Default Customer Pricing", routeMiles: 0,
      orderZoneException: false, crossZoneDelivery: false, peakSurchargeAmount: 0,
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
  const delivery = record(data.delivery);
  const pricingPolicy = record(data.pricingPolicy);
  const pricingZoneId = text(data.pricingZoneId) || null;
  const customerZoneId = text(data.customerHomeZoneId);
  const storeZoneId = text(data.storeHomeZoneId);

  return {
    confirmedDay: confirmedAt ? utcDay(confirmedAt) : null,
    grossCustomerPayments: Math.max(0, number(pricing.totalAmount)),
    outcomeDay: outcomeAt ? utcDay(outcomeAt) : null,
    outcomeStatus,
    pricingZoneId,
    pricingZoneName: text(data.pricingZoneName) || text(pricingPolicy.zoneName) || (pricingZoneId ? "Delivery zone" : "Default Customer Pricing"),
    routeMiles: Math.max(0, number(data.trustedRouteDistanceMiles) || number(delivery.distanceMiles)),
    orderZoneException: data.zoneAccessType === "customer_order_zone",
    crossZoneDelivery: Boolean(customerZoneId && storeZoneId && customerZoneId !== storeZoneId),
    peakSurchargeAmount: Math.max(0, number(pricing.peakSurchargeAmount) || (pricing.isPeakTime === true ? number(pricingPolicy.peakSurchargeCents) : 0)),
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
    pricingZoneId: text(data.pricingZoneId) || null,
    pricingZoneName: text(data.pricingZoneName) || "Default Customer Pricing",
    routeMiles: Math.max(0, number(data.routeMiles)),
    orderZoneException: data.orderZoneException === true,
    crossZoneDelivery: data.crossZoneDelivery === true,
    peakSurchargeAmount: Math.max(0, number(data.peakSurchargeAmount)),
  };
}

function sameContribution(
  left: OrderContribution,
  right: OrderContribution
): boolean {
  return left.confirmedDay === right.confirmedDay &&
    left.grossCustomerPayments === right.grossCustomerPayments &&
    left.outcomeDay === right.outcomeDay &&
    left.outcomeStatus === right.outcomeStatus &&
    left.pricingZoneId === right.pricingZoneId &&
    left.pricingZoneName === right.pricingZoneName &&
    left.routeMiles === right.routeMiles &&
    left.orderZoneException === right.orderZoneException &&
    left.crossZoneDelivery === right.crossZoneDelivery &&
    left.peakSurchargeAmount === right.peakSurchargeAmount;
}

function incrementZoneReport(
  transaction: FirebaseFirestore.Transaction,
  contribution: OrderContribution,
  direction: 1 | -1,
): void {
  if (!contribution.confirmedDay) return;
  const zoneKey = contribution.pricingZoneId ?? "default_pricing";
  const reference = db.collection("platformDailyZoneReports")
    .doc(`${contribution.confirmedDay}_${zoneKey}`);
  transaction.set(reference, {
    date: contribution.confirmedDay,
    pricingZoneId: contribution.pricingZoneId,
    pricingZoneName: contribution.pricingZoneName,
    orders: FieldValue.increment(direction),
    revenueAmount: FieldValue.increment(direction * contribution.grossCustomerPayments),
    routeMiles: FieldValue.increment(direction * contribution.routeMiles),
    orderZoneExceptions: FieldValue.increment(direction * (contribution.orderZoneException ? 1 : 0)),
    crossZoneDeliveries: FieldValue.increment(direction * (contribution.crossZoneDelivery ? 1 : 0)),
    peakSurchargeAmount: FieldValue.increment(direction * contribution.peakSurchargeAmount),
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
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
    incrementZoneReport(transaction, previous, -1);
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
    incrementZoneReport(transaction, next, 1);
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
    pricingZoneId: null, pricingZoneName: "Default Customer Pricing", routeMiles: 0,
    orderZoneException: false, crossZoneDelivery: false, peakSurchargeAmount: 0,
  };

  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(contributionReference);
    const previous = existing.exists
      ? savedContribution(existing.data() ?? {})
      : {confirmedDay: null, grossCustomerPayments: 0, outcomeDay: null, outcomeStatus: null, pricingZoneId: null, pricingZoneName: "Default Customer Pricing", routeMiles: 0, orderZoneException: false, crossZoneDelivery: false, peakSurchargeAmount: 0};

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

/** Maintains an exact lifetime distinct-customer count for each store. */
export async function synchronizeStoreCustomerRelationship(
  orderId: string,
  data: Data | null,
): Promise<void> {
  if (!data || data.checkoutStatus !== "confirmed" || record(data.payment).status !== "paid") return;
  const storeId = text(record(data.store).id);
  const customer = record(data.customer);
  const customerId = text(customer.uid);
  if (!storeId || !customerId) return;

  await db.collection("stores").doc(storeId).collection("customers").doc(customerId).set({
    customerId,
    name: text(customer.name),
    lastOrderId: orderId,
    lastOrderAt: data.createdAt ?? FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
}

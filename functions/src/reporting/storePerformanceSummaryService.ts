import * as admin from "firebase-admin";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {localDateKey, localHour} from "./storeAnalyticsPeriod";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");
type Data = Record<string, unknown>;

export interface StorePerformanceContribution {
  storeId: string;
  day: string;
  hour: number;
  paidOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  openOrders: number;
  pendingOrders: number;
  activeOrders: number;
  grossMerchandise: number;
  salesTax: number;
  grossStoreEntitlement: number;
  storeCommission: number;
  refundedMerchandise: number;
  refundedSalesTax: number;
  storeRefundImpact: number;
  customerRefundTotal: number;
  refundCount: number;
  customerId: string;
  productSales: Record<string, {name: string; sales: number}>;
}

const numericFields: Array<keyof StorePerformanceContribution> = [
  "paidOrders", "deliveredOrders", "cancelledOrders", "openOrders",
  "pendingOrders", "activeOrders", "grossMerchandise", "salesTax",
  "grossStoreEntitlement", "storeCommission", "refundedMerchandise",
  "refundedSalesTax", "storeRefundImpact", "customerRefundTotal", "refundCount",
];
const activeStatuses = new Set(["pending", "accepted", "preparing", "ready_for_pickup", "driver_assigned", "picked_up", "out_for_delivery"]);

function record(value: unknown): Data {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Data : {};
}
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function cents(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}
function date(value: unknown): Date | null {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const parsed = value.toDate();
    return parsed instanceof Date ? parsed : null;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}
function emptyContribution(): StorePerformanceContribution {
  return {storeId: "", day: "", hour: 0, paidOrders: 0, deliveredOrders: 0, cancelledOrders: 0, openOrders: 0, pendingOrders: 0, activeOrders: 0, grossMerchandise: 0, salesTax: 0, grossStoreEntitlement: 0, storeCommission: 0, refundedMerchandise: 0, refundedSalesTax: 0, storeRefundImpact: 0, customerRefundTotal: 0, refundCount: 0, customerId: "", productSales: {}};
}
function savedContribution(value: Data): StorePerformanceContribution {
  const result = emptyContribution();
  result.storeId = text(value.storeId); result.day = text(value.day);
  result.hour = Math.max(0, Math.min(23, Number(value.hour) || 0));
  result.customerId = text(value.customerId);
  numericFields.forEach((field) => { (result[field] as number) = cents(value[field]); });
  const products = record(value.productSales);
  result.productSales = Object.fromEntries(Object.entries(products).map(([id, item]) => {
    const data = record(item); return [id, {name: text(data.name) || "Product", sales: cents(data.sales)}];
  }));
  return result;
}

async function buildContribution(orderId: string): Promise<StorePerformanceContribution> {
  const order = await db.collection("orders").doc(orderId).get();
  if (!order.exists) return emptyContribution();
  const data = order.data() ?? {};
  const payment = record(data.payment);
  if (data.checkoutStatus !== "confirmed" || payment.status !== "paid") return emptyContribution();
  const storeId = text(record(data.store).id);
  if (!storeId) return emptyContribution();
  const [store, settlement, refunds] = await Promise.all([
    db.collection("stores").doc(storeId).get(),
    db.collection("paymentSettlements").doc(orderId).get(),
    db.collection("paymentRefunds").where("orderId", "==", orderId).get(),
  ]);
  const timeZone = text(store.data()?.timeZone) || "America/Chicago";
  const paidAt = date(payment.paidAt) ?? date(data.createdAt) ?? new Date();
  const pricing = record(data.pricing);
  const merchandise = cents(pricing.subtotalAmount);
  const tax = cents(pricing.taxAmount);
  const entitlement = settlement.exists ? cents(settlement.data()?.storeAmount) : 0;
  let refundedMerchandise = 0, refundedSalesTax = 0, storeRefundImpact = 0, customerRefundTotal = 0, refundCount = 0;
  refunds.docs.forEach((snapshot) => {
    const refund = snapshot.data();
    if (refund.status !== "completed") return;
    const allocation = record(refund.allocation);
    refundedMerchandise += cents(allocation.merchandiseAmount);
    refundedSalesTax += cents(allocation.taxAmount);
    customerRefundTotal += cents(allocation.totalAmount);
    refundCount += 1;
    const reversals = Array.isArray(refund.reversals) ? refund.reversals.map(record) : [];
    storeRefundImpact += reversals.filter((item) => item.recipientType === "store" && item.status === "completed")
      .reduce((sum, item) => sum + cents(item.amount), 0);
  });
  const status = text(data.status);
  const delivered = status === "completed" || status === "delivered";
  const cancelled = status === "cancelled";
  const productSales: StorePerformanceContribution["productSales"] = {};
  if (Array.isArray(data.items)) data.items.forEach((value: unknown) => {
    const item = record(value); const id = text(item.id) || text(item.name); if (!id) return;
    const current = productSales[id] ?? {name: text(item.name) || "Product", sales: 0};
    current.sales += cents(item.quantity); productSales[id] = current;
  });
  return {storeId, day: localDateKey(paidAt, timeZone, false), hour: localHour(paidAt, timeZone), paidOrders: 1, deliveredOrders: delivered ? 1 : 0, cancelledOrders: cancelled ? 1 : 0, openOrders: delivered || cancelled ? 0 : 1, pendingOrders: status === "pending" ? 1 : 0, activeOrders: activeStatuses.has(status) ? 1 : 0, grossMerchandise: merchandise, salesTax: tax, grossStoreEntitlement: entitlement, storeCommission: entitlement ? Math.max(0, merchandise + tax - entitlement) : 0, refundedMerchandise, refundedSalesTax, storeRefundImpact, customerRefundTotal, refundCount, customerId: text(record(data.customer).uid), productSales};
}

function applyDelta(
  current: Data,
  previous: StorePerformanceContribution,
  next: StorePerformanceContribution,
  includeDimensions = true,
): Data {
  const output: Data = {...current};
  numericFields.forEach((field) => {
    const previousValue = Number(previous[field]);
    const nextValue = Number(next[field]);
    output[field] = Math.max(0, cents(current[field]) - previousValue + nextValue);
  });
  const hours = Array.isArray(current.peakHours) ? current.peakHours.map((value) => cents(value)).slice(0, 24) : Array(24).fill(0);
  while (hours.length < 24) hours.push(0);
  if (previous.paidOrders) hours[previous.hour] = Math.max(0, hours[previous.hour] - previous.paidOrders);
  if (next.paidOrders) hours[next.hour] += next.paidOrders;
  output.peakHours = hours;
  if (!includeDimensions) {
    output.updatedAt = FieldValue.serverTimestamp();
    return output;
  }
  const products = record(current.productSales);
  const merged: Record<string, {name: string; sales: number}> = {};
  Object.entries(products).forEach(([id, value]) => { const item = record(value); merged[id] = {name: text(item.name) || "Product", sales: cents(item.sales)}; });
  Object.entries(previous.productSales).forEach(([id, item]) => { if (!merged[id]) return; merged[id].sales = Math.max(0, merged[id].sales - item.sales); if (!merged[id].sales) delete merged[id]; });
  Object.entries(next.productSales).forEach(([id, item]) => { const existing = merged[id] ?? {name: item.name, sales: 0}; existing.name = item.name; existing.sales += item.sales; merged[id] = existing; });
  output.productSales = merged;
  const customerOrderCounts = Object.fromEntries(
    Object.entries(record(current.customerOrderCounts))
      .map(([id, value]) => [id, cents(value)])
      .filter(([, value]) => value > 0),
  ) as Record<string, number>;
  if (previous.customerId && previous.paidOrders) {
    const remaining = Math.max(
      0,
      (customerOrderCounts[previous.customerId] ?? 0) - previous.paidOrders,
    );
    if (remaining) customerOrderCounts[previous.customerId] = remaining;
    else delete customerOrderCounts[previous.customerId];
  }
  if (next.customerId && next.paidOrders) {
    customerOrderCounts[next.customerId] =
      (customerOrderCounts[next.customerId] ?? 0) + next.paidOrders;
  }
  output.customerOrderCounts = customerOrderCounts;
  output.updatedAt = FieldValue.serverTimestamp();
  return output;
}

export async function synchronizeStorePerformanceSummary(orderId: string): Promise<void> {
  const contributionRef = db.collection("storePerformanceContributions").doc(orderId);
  const next = await buildContribution(orderId);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(contributionRef);
    const previous = existing.exists ? savedContribution(existing.data() ?? {}) : emptyContribution();
    const keys = new Set([previous.storeId && `${previous.storeId}:${previous.day}`, next.storeId && `${next.storeId}:${next.day}`].filter(Boolean));
    const refs = [...keys].map((key) => { const [storeId, day] = key.split(":"); return db.collection("stores").doc(storeId).collection("dailyPerformance").doc(day); });
    const lifetimeIds = [...new Set([previous.storeId, next.storeId].filter(Boolean))];
    const lifetimeRefs = lifetimeIds.map((storeId) => db.collection("stores").doc(storeId).collection("reporting").doc("lifetime"));
    const snapshots = await Promise.all([...refs, ...lifetimeRefs].map((reference) => transaction.get(reference)));
    refs.forEach((reference, index) => {
      const [storeId, day] = [...keys][index].split(":");
      const previousForDay = previous.storeId === storeId && previous.day === day ? previous : emptyContribution();
      const nextForDay = next.storeId === storeId && next.day === day ? next : emptyContribution();
      transaction.set(reference, {storeId, day, ...applyDelta(snapshots[index].data() ?? {}, previousForDay, nextForDay)}, {merge: true});
    });
    lifetimeRefs.forEach((reference, offset) => {
      const storeId = lifetimeIds[offset];
      const previousForStore = previous.storeId === storeId ? previous : emptyContribution();
      const nextForStore = next.storeId === storeId ? next : emptyContribution();
      transaction.set(reference, {storeId, ...applyDelta(snapshots[refs.length + offset].data() ?? {}, previousForStore, nextForStore, false)}, {merge: true});
    });
    for (const storeId of lifetimeIds) {
      transaction.set(db.collection("stores").doc(storeId), {
        performanceSummaryVersion: 1,
        performanceSummaryUpdatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    }
    if (next.storeId) transaction.set(contributionRef, {...next, updatedAt: FieldValue.serverTimestamp()});
    else transaction.delete(contributionRef);
  });
}

export async function backfillStorePerformanceSummaries(storeId: string): Promise<number> {
  const orders = await db.collection("orders").where("store.id", "==", storeId).where("checkoutStatus", "==", "confirmed").where("payment.status", "==", "paid").get();
  for (const order of orders.docs) await synchronizeStorePerformanceSummary(order.id);
  await db.collection("stores").doc(storeId).set({
    performanceSummaryVersion: 1,
    performanceSummaryUpdatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});
  return orders.size;
}

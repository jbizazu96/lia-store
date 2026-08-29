/*
|--------------------------------------------------------------------------
| Admin Order Operations
|--------------------------------------------------------------------------
|
| Admin order operations are read-only in this phase. Orders are paid before
| they enter this workspace and all private data is selected server-side.
|
*/

import * as admin from "firebase-admin";
import {getFirestore} from "firebase-admin/firestore";
import {onCall} from "firebase-functions/v2/https";
import {requireAdminPermission} from "../admin/adminAuthorizationService";

if (admin.apps.length === 0) admin.initializeApp();

const db = getFirestore("default");
const DELAYED_PICKUP_MINUTES = 45;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function number(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function date(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as {toDate?: unknown}).toDate === "function") {
    const result = (value as {toDate: () => Date}).toDate();
    return result instanceof Date ? result.toISOString() : null;
  }
  return typeof value === "string" ? value : null;
}
function money(value: unknown): number { return Math.max(0, number(value)); }
function pricing(data: Record<string, unknown>) {
  const value = record(data.pricing);
  return {
    currency: text(value.currency) || "usd",
    subtotalAmount: money(value.subtotalAmount), deliveryFeeAmount: money(value.deliveryFeeAmount),
    serviceFeeAmount: money(value.serviceFeeAmount), taxAmount: money(value.taxAmount),
    tipAmount: money(value.tipAmount), totalAmount: money(value.totalAmount),
  };
}
function exceptions(data: Record<string, unknown>) {
  const delivery = record(data.delivery); const shipday = record(data.shipday);
  const scheduling = record(data.scheduling); const status = text(data.status); const createdAt = date(data.createdAt);
  const scheduledStart = scheduling.timing === "scheduled" ? date(scheduling.windowStart) : null;
  const waitingSince = scheduledStart && new Date(scheduledStart).getTime() > new Date(createdAt ?? 0).getTime() ? scheduledStart : createdAt;
  const ageMinutes = waitingSince ? (Date.now() - new Date(waitingSince).getTime()) / 60000 : 0;
  const pickupWaiting = ["pending", "accepted", "preparing", "ready_for_pickup"].includes(status);
  const hasCarrier = Boolean(text(delivery.driverId) || text(delivery.shipdayCarrierId));
  const result: string[] = [];
  const customerPickup = data.fulfillmentType === "pickup";
  if (status === "cancelled" || text(shipday.status) === "cancelled") result.push("cancelled");
  if (!customerPickup && text(shipday.orderId) && !hasCarrier && !["delivered", "cancelled", "failed"].includes(text(shipday.status))) result.push("no_driver");
  if (pickupWaiting && ageMinutes >= DELAYED_PICKUP_MINUTES) result.push("delayed_pickup");
  if (text(shipday.status) === "failed" || text(shipday.error)) result.push("shipday_failed");
  return result;
}
function listItem(document: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = document.data(); const store = record(data.store); const customer = record(data.customer);
  const delivery = record(data.delivery); const shipday = record(data.shipday); const payment = record(data.payment);
  const scheduling = record(data.scheduling);
  return {
    id: document.id, orderNumber: text(data.orderNumber) || "Unavailable",
    fulfillmentType: data.fulfillmentType === "pickup" ? "pickup" : "delivery",
    status: text(data.status) || "pending", createdAt: date(data.createdAt),
    storeName: text(store.name) || "Store", customerName: text(customer.name) || "Customer",
    totalAmount: pricing(data).totalAmount, currency: pricing(data).currency,
    paymentStatus: text(payment.status) || "paid", driverName: text(delivery.driverName) || null,
    shipdayStatus: text(shipday.status) || null, exceptions: exceptions(data),
    fulfillmentTiming: scheduling.timing === "scheduled" ? "scheduled" : "asap",
    scheduledWindowStart: date(scheduling.windowStart), scheduledWindowEnd: date(scheduling.windowEnd),
    fulfillmentTimezone: text(scheduling.timezone) || null,
  };
}

export const getAdminOrders = onCall({region: "us-central1"}, async (request) => {
  await requireAdminPermission(request, "orders");
  const input = record(request.data); const status = text(input.status) || "all"; const exception = text(input.exception) || "all";
  const cursorId = text(input.cursor);
  let cursor = cursorId ? await db.collection("orders").doc(cursorId).get() : null;
  const orders: ReturnType<typeof listItem>[] = [];
  let exhausted = false;
  while (orders.length < 50 && !exhausted) {
    let query = db.collection("orders").where("checkoutStatus", "==", "confirmed").orderBy("createdAt", "desc").limit(100);
    if (cursor?.exists) query = query.startAfter(cursor);
    const snapshot = await query.get();
    let consumed = 0;
    for (const document of snapshot.docs) {
      consumed += 1;
      cursor = document;
      const item = listItem(document);
      if ((status === "all" || item.status === status) && (exception === "all" || item.exceptions.includes(exception))) orders.push(item);
      if (orders.length >= 50) break;
    }
    exhausted = consumed === snapshot.size && snapshot.size < 100;
  }
  return {orders, nextCursor: exhausted ? null : cursor?.id ?? null};
});

export const getAdminOrder = onCall({region: "us-central1"}, async (request) => {
  await requireAdminPermission(request, "orders");
  const orderId = text(record(request.data).orderId);
  if (!orderId) throw new Error("An order is required.");
  const snapshot = await db.collection("orders").doc(orderId).get();
  if (!snapshot.exists || snapshot.data()?.checkoutStatus !== "confirmed") throw new Error("The paid order was not found.");
  const data = snapshot.data() ?? {}; const store = record(data.store); const customer = record(data.customer);
  const delivery = record(data.delivery); const address = record(delivery.address); const shipday = record(data.shipday); const payment = record(data.payment);
  const items = Array.isArray(data.items) ? data.items.map((value) => { const item = record(value); return {name: text(item.name) || "Product", quantity: number(item.quantity), unitPriceAmount: money(item.unitPriceAmount), lineTotalAmount: money(item.lineTotalAmount)}; }) : [];
  const history = Array.isArray(data.statusHistory) ? data.statusHistory.map((value) => { const item = record(value); return {status: text(item.status), timestamp: date(item.timestamp), note: text(item.note) || null}; }) : [];
  return {
    ...listItem(snapshot as FirebaseFirestore.QueryDocumentSnapshot),
    customer: {name: text(customer.name) || "Customer", email: text(customer.email) || null, phone: text(customer.phone) || null, address: text(address.formattedAddress) || [text(address.street), text(address.city), text(address.state), text(address.zip)].filter(Boolean).join(", ") || null},
    store: {name: text(store.name) || "Store", phone: text(store.phone) || null, address: text(store.formattedAddress) || [text(store.address), text(store.city), text(store.state), text(store.zip)].filter(Boolean).join(", ") || null},
    delivery: {driverName: text(delivery.driverName) || null, driverId: text(delivery.driverId) || null, distanceMiles: number(delivery.distanceMiles) || null, estimatedMinutes: number(delivery.estimatedMinutes) || null, shipdayStatus: text(shipday.status) || null, shipdayOrderId: text(shipday.orderId) || null, lastSyncAt: date(shipday.lastSyncAt), cancellationReason: text(data.cancellationReason) || text(shipday.cancellationReason) || null},
    payment: {status: text(payment.status) || "paid", paidAt: date(payment.paidAt), currency: pricing(data).currency}, pricing: pricing(data), items, history,
  };
});

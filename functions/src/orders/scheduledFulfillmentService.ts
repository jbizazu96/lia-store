import {createHash} from "node:crypto";
import {FieldValue, Timestamp, getFirestore} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import type {OrderDeliveryPolicy} from "../admin/orderDeliveryPolicy";
import type {PrepareCheckoutPaymentRequest, TrustedCheckoutStore} from "../payment/checkout/checkoutPaymentTypes";

const db = getFirestore("default");
type Reservation = {customerUid: string; expiresAt: Timestamp; status: "held" | "confirmed"};
const STORE_OPENING_BUFFER_MINUTES = 30;
const STORE_CLOSING_BUFFER_MINUTES = 30;

function localParts(date: Date, timezone: string) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-US", {timeZone: timezone, weekday: "long", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"}).formatToParts(date).map((part) => [part.type, part.value]));
  return {day: values.weekday, date: `${values.year}-${values.month}-${values.day}`, minutes: Number(values.hour) * 60 + Number(values.minute)};
}
function clock(value: string): number { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; }
function slotId(storeId: string, type: string, start: string) { return createHash("sha256").update(`${storeId}|${type}|${start}`).digest("hex").slice(0, 40); }

export interface ScheduledFulfillmentSnapshot {timing: "asap" | "scheduled"; windowStart: string | null; windowEnd: string | null; timezone: string; preparationLeadMinutes: number; slotId: string | null; capacity: number | null; reservationId: string | null;}

export async function reserveScheduledFulfillment(input: {request: PrepareCheckoutPaymentRequest; store: TrustedCheckoutStore; policy: OrderDeliveryPolicy; checkoutSessionId: string; checkoutExpiresAt: string; customerUid: string;}): Promise<ScheduledFulfillmentSnapshot> {
  const timing = input.request.fulfillmentTiming;
  const timezone = input.store.fulfillmentTimezone;
  const preparation = input.request.fulfillmentType === "pickup" ? input.store.pickupPreparationMinutes ?? input.policy.defaultPreparationMinutes : input.policy.defaultPreparationMinutes;
  if (timing !== "scheduled") return {timing: "asap", windowStart: null, windowEnd: null, timezone, preparationLeadMinutes: preparation, slotId: null, capacity: null, reservationId: null};
  const window = input.request.scheduledWindow;
  if (!window || window.timezone !== timezone) throw new HttpsError("failed-precondition", "Choose a valid fulfillment time for this store.");
  const start = new Date(window.start); const end = new Date(window.end); const now = new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start <= now || end <= start) throw new HttpsError("invalid-argument", "The scheduled fulfillment window is invalid.");
  const globalEnabled = input.request.fulfillmentType === "pickup" ? input.policy.scheduling.pickupEnabled : input.policy.scheduling.deliveryEnabled;
  const storeEnabled = input.request.fulfillmentType === "pickup" ? input.store.scheduledPickupEnabled : input.store.scheduledDeliveryEnabled;
  if (!globalEnabled || !storeEnabled) throw new HttpsError("failed-precondition", `Scheduled ${input.request.fulfillmentType} is not available for this store.`);
  if (start.getTime() < now.getTime() + preparation * 60_000) throw new HttpsError("failed-precondition", `Choose a time at least ${preparation} minutes from now.`);
  if (start.getTime() > now.getTime() + input.policy.scheduling.maximumDaysAhead * 86_400_000) throw new HttpsError("failed-precondition", `Orders may be scheduled up to ${input.policy.scheduling.maximumDaysAhead} days ahead.`);
  if (end.getTime() - start.getTime() !== input.policy.scheduling.slotIntervalMinutes * 60_000) throw new HttpsError("invalid-argument", "The scheduled time-slot duration is invalid.");
  const startLocal = localParts(start, timezone); const endLocal = localParts(end, timezone);
  const schedule = input.store.schedule.find((entry) => entry.day === startLocal.day);
  if (
    !schedule ||
    schedule.isClosed ||
    startLocal.date !== endLocal.date ||
    startLocal.minutes < clock(schedule.open) + STORE_OPENING_BUFFER_MINUTES ||
    endLocal.minutes > clock(schedule.close) - STORE_CLOSING_BUFFER_MINUTES
  ) throw new HttpsError("failed-precondition", "Choose a time at least 30 minutes after the store opens and ending at least 30 minutes before it closes.");
  const id = slotId(input.store.id, input.request.fulfillmentType, window.start); const reference = db.collection("stores").doc(input.store.id).collection("fulfillmentSlots").doc(id);
  const capacity = input.store.scheduledOrdersPerSlot || input.policy.scheduling.defaultOrdersPerSlot;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference); const data = snapshot.data() ?? {}; const current = (data.reservations && typeof data.reservations === "object" ? data.reservations : {}) as Record<string, Reservation>;
    const active = Object.fromEntries(Object.entries(current).filter(([, reservation]) => reservation?.expiresAt?.toMillis?.() > Date.now()));
    if (!active[input.checkoutSessionId] && Object.keys(active).length >= capacity) throw new HttpsError("resource-exhausted", "That time is now full. Choose another available window.");
    active[input.checkoutSessionId] = {customerUid: input.customerUid, expiresAt: Timestamp.fromDate(new Date(input.checkoutExpiresAt)), status: "held"};
    transaction.set(reference, {storeId: input.store.id, fulfillmentType: input.request.fulfillmentType, windowStart: Timestamp.fromDate(start), windowEnd: Timestamp.fromDate(end), timezone, capacity, reservations: active, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  });
  return {timing: "scheduled", windowStart: start.toISOString(), windowEnd: end.toISOString(), timezone, preparationLeadMinutes: preparation, slotId: id, capacity, reservationId: input.checkoutSessionId};
}

export async function confirmScheduledFulfillmentReservation(order: Record<string, unknown>): Promise<void> {
  const scheduling = order.scheduling as ScheduledFulfillmentSnapshot | undefined; const store = order.store as {id?: unknown} | undefined;
  if (scheduling?.timing !== "scheduled" || !scheduling.slotId || !scheduling.reservationId || typeof store?.id !== "string" || !scheduling.windowEnd) return;
  const reference = db.collection("stores").doc(store.id).collection("fulfillmentSlots").doc(scheduling.slotId);
  await db.runTransaction(async (transaction) => { const snapshot = await transaction.get(reference); if (!snapshot.exists) return; const data = snapshot.data() ?? {}; const reservations = (data.reservations && typeof data.reservations === "object" ? data.reservations : {}) as Record<string, Reservation>; const reservation = reservations[scheduling.reservationId!]; if (!reservation) return; reservations[scheduling.reservationId!] = {...reservation, status: "confirmed", expiresAt: Timestamp.fromDate(new Date(scheduling.windowEnd!))}; transaction.update(reference, {reservations, updatedAt: FieldValue.serverTimestamp()}); });
}

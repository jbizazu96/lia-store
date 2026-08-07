import {getFirestore} from "firebase-admin/firestore";

export interface OrderDeliveryPolicy {
  minutesPerMile: number;
  defaultPreparationMinutes: number;
  reminderIntervalsMinutes: {pending: number; accepted: number; preparing: number};
}

export const ORDER_DELIVERY_POLICY_DOCUMENT = "orderDelivery";
const defaults: OrderDeliveryPolicy = {minutesPerMile: 2, defaultPreparationMinutes: 5, reminderIntervalsMinutes: {pending: 5, accepted: 5, preparing: 10}};
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function integer(value: unknown, fallback: number, min: number, max: number): number { return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : fallback; }
export function parseOrderDeliveryPolicy(value: unknown): OrderDeliveryPolicy { const data = record(value); const intervals = record(data.reminderIntervalsMinutes); return {minutesPerMile: integer(data.minutesPerMile, defaults.minutesPerMile, 1, 60), defaultPreparationMinutes: integer(data.defaultPreparationMinutes, defaults.defaultPreparationMinutes, 0, 180), reminderIntervalsMinutes: {pending: integer(intervals.pending, defaults.reminderIntervalsMinutes.pending, 5, 1440), accepted: integer(intervals.accepted, defaults.reminderIntervalsMinutes.accepted, 5, 1440), preparing: integer(intervals.preparing, defaults.reminderIntervalsMinutes.preparing, 5, 1440)}}; }
export async function getOrderDeliveryPolicy(): Promise<OrderDeliveryPolicy> { const snapshot = await getFirestore("default").collection("settings").doc(ORDER_DELIVERY_POLICY_DOCUMENT).get(); return parseOrderDeliveryPolicy(snapshot.data()); }

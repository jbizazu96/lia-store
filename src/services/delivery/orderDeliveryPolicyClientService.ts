import {httpsCallable} from "firebase/functions";
import {functions} from "@/lib/firebase";
import {loadCached} from "@/services/cache/clientDataCache";

export interface OrderDeliveryPolicy {
  minutesPerMile: number;
  defaultPreparationMinutes: number;
  reminderIntervalsMinutes: {pending: number; accepted: number; preparing: number};
  scheduling: {
    pickupEnabled: boolean;
    deliveryEnabled: boolean;
    maximumDaysAhead: number;
    slotIntervalMinutes: number;
    defaultOrdersPerSlot: number;
  };
}

const DEFAULT_POLICY: OrderDeliveryPolicy = {
  minutesPerMile: 2,
  defaultPreparationMinutes: 5,
  reminderIntervalsMinutes: {pending: 5, accepted: 5, preparing: 10},
  scheduling: {pickupEnabled: true, deliveryEnabled: true, maximumDaysAhead: 7, slotIntervalMinutes: 30, defaultOrdersPerSlot: 5},
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

export function normalizeOrderDeliveryPolicy(value: unknown): OrderDeliveryPolicy {
  const policy = record(value);
  const reminders = record(policy.reminderIntervalsMinutes);
  const scheduling = record(policy.scheduling);
  return {
    minutesPerMile: integer(policy.minutesPerMile, DEFAULT_POLICY.minutesPerMile, 1, 60),
    defaultPreparationMinutes: integer(policy.defaultPreparationMinutes, DEFAULT_POLICY.defaultPreparationMinutes, 0, 180),
    reminderIntervalsMinutes: {
      pending: integer(reminders.pending, DEFAULT_POLICY.reminderIntervalsMinutes.pending, 5, 1_440),
      accepted: integer(reminders.accepted, DEFAULT_POLICY.reminderIntervalsMinutes.accepted, 5, 1_440),
      preparing: integer(reminders.preparing, DEFAULT_POLICY.reminderIntervalsMinutes.preparing, 5, 1_440),
    },
    scheduling: {
      pickupEnabled: scheduling.pickupEnabled !== false,
      deliveryEnabled: scheduling.deliveryEnabled !== false,
      maximumDaysAhead: integer(scheduling.maximumDaysAhead, DEFAULT_POLICY.scheduling.maximumDaysAhead, 1, 30),
      slotIntervalMinutes: integer(scheduling.slotIntervalMinutes, DEFAULT_POLICY.scheduling.slotIntervalMinutes, 15, 120),
      defaultOrdersPerSlot: integer(scheduling.defaultOrdersPerSlot, DEFAULT_POLICY.scheduling.defaultOrdersPerSlot, 1, 100),
    },
  };
}

export const orderDeliveryPolicyClientService = {
  getPolicy: (): Promise<OrderDeliveryPolicy> => loadCached(
    "order-delivery-policy-v2",
    async () => {
      const result = await httpsCallable<unknown, {policy?: unknown}>(functions, "getOrderDeliveryPolicyForClient")();
      return normalizeOrderDeliveryPolicy(result.data.policy);
    },
    {ttlMs: 60_000},
  ),
};

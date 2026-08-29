/*
|--------------------------------------------------------------------------
| Store Order Reminder Scheduler
|--------------------------------------------------------------------------
|
| Reminds a store owner while an order still needs a store action:
|
| - pending: every 5 minutes
| - accepted: every 5 minutes
| - preparing: every 10 minutes
|
| Orders are deliberately excluded once they reach ready_for_pickup; Shipday
| owns the delivery flow from that point onward.
|
*/

import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { storeEvents } from "../events/storeEvents";
import {getOrderDeliveryPolicy} from "../admin/orderDeliveryPolicy";

type ReminderStatus = "pending" | "accepted" | "preparing";

interface ReminderState {
  status?: unknown;
  lastSentAt?: unknown;
  count?: unknown;
}

function isReminderStatus(value: unknown): value is ReminderStatus {
  return (
    value === "pending" ||
    value === "accepted" ||
    value === "preparing"
  );
}

function toMilliseconds(value: unknown): number | null {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }

  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as { toMillis?: unknown }).toMillis === "function"
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "string" || typeof value === "number") {
    const milliseconds = new Date(value).getTime();
    return Number.isNaN(milliseconds) ? null : milliseconds;
  }

  return null;
}

function getStatusStartedAt(
  order: Record<string, unknown>,
  status: ReminderStatus
): number | null {
  const history = Array.isArray(order.statusHistory)
    ? order.statusHistory
    : [];

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];

    if (
      entry &&
      typeof entry === "object" &&
      (entry as { status?: unknown }).status === status
    ) {
      const timestamp = toMilliseconds(
        (entry as { timestamp?: unknown }).timestamp
      );

      if (timestamp !== null) {
        return timestamp;
      }
    }
  }

  return (
    toMilliseconds(order.updatedAt) ??
    toMilliseconds(order.createdAt)
  );
}

interface DueReminder {
  kind: "status" | "scheduled_preparation";
  orderId: string;
  storeOwnerUid: string;
  status: ReminderStatus;
  count: number;
  orderNumber?: string;
}

/**
 * Runs every five minutes. Firestore transactions reserve each reminder
 * before it is sent, so overlapping scheduler executions cannot notify the
 * same order twice for one interval.
 */
export const remindStoreOrders = onSchedule(
  {
    schedule: "every 5 minutes",
    region: "us-central1",
    timeZone: "America/Chicago",
    retryCount: 3,
  },
  async () => {
    const db = getFirestore("default");
    const now = Date.now();
    const policy = await getOrderDeliveryPolicy();
    const reminderIntervalsMs: Record<ReminderStatus, number> = {
      pending: policy.reminderIntervalsMinutes.pending * 60 * 1000,
      accepted: policy.reminderIntervalsMinutes.accepted * 60 * 1000,
      preparing: policy.reminderIntervalsMinutes.preparing * 60 * 1000,
    };

    const ordersSnapshot = await db
      .collection("orders")
      .where("status", "in", ["pending", "accepted", "preparing"])
      .get();

    if (ordersSnapshot.empty) {
      console.log("No store orders currently need reminders.");
      return;
    }

    const dueReminders = await Promise.all(
      ordersSnapshot.docs.map(async (orderDocument) => {
        return db.runTransaction(async (transaction) => {
          const freshOrderSnapshot = await transaction.get(orderDocument.ref);

          if (!freshOrderSnapshot.exists) {
            return null;
          }

          const order = freshOrderSnapshot.data();

          if (!order) {
            return null;
          }

          const status = order.status;

          /*
           * An unpaid checkout is stored with fulfillment status "pending"
           * while the customer is still completing Stripe payment. Stores
           * must never receive reminders for those records.
           */
          if (
            order.checkoutStatus !== "confirmed"
          ) {
            return null;
          }

          if (!isReminderStatus(status)) {
            return null;
          }

          const scheduling = order.scheduling && typeof order.scheduling === "object"
            ? order.scheduling as {timing?: unknown; windowStart?: unknown; preparationLeadMinutes?: unknown}
            : null;
          if (scheduling?.timing === "scheduled" && status !== "preparing") {
            const windowStart = toMilliseconds(scheduling.windowStart);
            const preparationLeadMinutes = typeof scheduling.preparationLeadMinutes === "number" &&
              Number.isFinite(scheduling.preparationLeadMinutes) && scheduling.preparationLeadMinutes >= 0
              ? scheduling.preparationLeadMinutes
              : policy.defaultPreparationMinutes;
            const preparationLeadMs = preparationLeadMinutes * 60_000;
            if (windowStart !== null && now < windowStart - preparationLeadMs) return null;

            if (
              status === "accepted" &&
              toMilliseconds(order.scheduledPreparationNotificationSentAt) === null
            ) {
              const storeOwnerUid = order.store?.ownerId;
              if (typeof storeOwnerUid !== "string" || !storeOwnerUid.trim()) return null;
              transaction.set(orderDocument.ref, {
                scheduledPreparationNotificationSentAt: Timestamp.fromMillis(now),
              }, {merge: true});
              return {
                kind: "scheduled_preparation" as const,
                orderId: orderDocument.id,
                storeOwnerUid,
                status,
                count: 1,
                orderNumber: typeof order.orderNumber === "string" ? order.orderNumber : undefined,
              };
            }
          }

          const storeOwnerUid = order.store?.ownerId;

          if (typeof storeOwnerUid !== "string" || !storeOwnerUid.trim()) {
            console.error(
              `Order ${orderDocument.id} has no store owner; reminder skipped.`
            );
            return null;
          }

          const statusStartedAt = getStatusStartedAt(order, status);

          if (
            statusStartedAt === null ||
            now - statusStartedAt < reminderIntervalsMs[status]
          ) {
            return null;
          }

          const existingState = (order.storeReminder ?? {}) as ReminderState;
          const sameStatus = existingState.status === status;
          const lastSentAt = sameStatus
            ? toMilliseconds(existingState.lastSentAt)
            : null;

          if (
            lastSentAt !== null &&
            now - lastSentAt < reminderIntervalsMs[status]
          ) {
            return null;
          }

          const previousCount = sameStatus &&
            typeof existingState.count === "number" &&
            Number.isInteger(existingState.count) &&
            existingState.count >= 0
            ? existingState.count
            : 0;

          const reminder: DueReminder = {
            kind: "status",
            orderId: orderDocument.id,
            storeOwnerUid,
            status,
            count: previousCount + 1,
            orderNumber: typeof order.orderNumber === "string"
              ? order.orderNumber
              : undefined,
          };

          transaction.set(
            orderDocument.ref,
            {
              storeReminder: {
                status,
                lastSentAt: Timestamp.fromMillis(now),
                count: reminder.count,
              },
            },
            { merge: true }
          );

          return reminder;
        });
      })
    );

    const reminders = dueReminders.filter(
      (reminder): reminder is DueReminder => reminder !== null
    );

    await Promise.all(
      reminders.map(async (reminder) => {
        try {
          if (reminder.kind === "scheduled_preparation") {
            await storeEvents.scheduledPreparationReady(
              reminder.orderId,
              reminder.storeOwnerUid,
              reminder.orderNumber,
            );
          } else {
            await storeEvents.orderStatusReminder(
              reminder.orderId,
              reminder.storeOwnerUid,
              reminder.status,
              reminder.count,
              reminder.orderNumber
            );
          }
        } catch (error) {
          // A notification outage must not stop reminders for other orders.
          console.error(
            `Order reminder notification failed for ${reminder.orderId}:`,
            error
          );
        }
      })
    );

    console.log(
      `Store order reminder run completed: ${reminders.length} reminder(s) sent.`
    );
  }
);

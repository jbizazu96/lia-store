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

type ReminderStatus = "pending" | "accepted" | "preparing";

interface ReminderState {
  status?: unknown;
  lastSentAt?: unknown;
  count?: unknown;
}

const REMINDER_INTERVALS_MS: Record<ReminderStatus, number> = {
  pending: 5 * 60 * 1000,
  accepted: 5 * 60 * 1000,
  preparing: 10 * 60 * 1000,
};

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

          if (!isReminderStatus(status)) {
            return null;
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
            now - statusStartedAt < REMINDER_INTERVALS_MS[status]
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
            now - lastSentAt < REMINDER_INTERVALS_MS[status]
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
          await storeEvents.orderStatusReminder(
            reminder.orderId,
            reminder.storeOwnerUid,
            reminder.status,
            reminder.count,
            reminder.orderNumber
          );
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

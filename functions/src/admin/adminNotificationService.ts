/*
|--------------------------------------------------------------------------
| Admin Notification Service
|--------------------------------------------------------------------------
|
| Administrative notices live below each active administrator rather than in
| users/{uid}. Administrators intentionally do not require a customer profile.
|
*/

import * as admin from "firebase-admin";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {
  notificationService,
} from "../services/notificationService";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");

export interface AdminNotificationInput {
  title: string;
  body: string;
  type:
    | "application"
    | "document"
    | "expiration"
    | "customer"
    | "product"
    | "inventory"
    | "payment"
    | "refund"
    | "account";
  deepLink?: string;
  subject?: {
    type: string;
    id: string;
  };
  /* Deterministic keys make scheduled reminders and retried triggers safe. */
  dedupeKey?: string;
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 1_200);
}

async function activeAdministratorIds(): Promise<string[]> {
  const administrators = await db
    .collection("admins")
    .where("isActive", "==", true)
    .get();

  return administrators.docs
    .filter((document) => typeof document.data().email === "string")
    .map((document) => document.id);
}

/*
 * Fan-out is intentional: the Admin team is small and each person needs an
 * independent read state. Deactivating an admin stops future delivery.
 */
export async function notifyActiveAdministrators(
  input: AdminNotificationInput
): Promise<void> {
  const administratorIds = await activeAdministratorIds();

  await Promise.all(administratorIds.map(async (administratorId) => {
    const notifications = db
      .collection("admins")
      .doc(administratorId)
      .collection("notifications");
    const data = {
      title: input.title,
      body: input.body,
      type: input.type,
      ...(input.deepLink ? {deepLink: input.deepLink} : {}),
      ...(input.subject ? {subject: input.subject} : {}),
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (!input.dedupeKey) {
      await notifications.add(data);
    } else {
      try {
        await notifications.doc(safeId(input.dedupeKey)).create(data);
      } catch (error) {
        const code = (error as {code?: unknown}).code;
        if (code === 6 || code === "already-exists") {
          return;
        }

        throw error;
      }
    }

    try {
      await notificationService.sendToUser(
        administratorId,
        input.title,
        input.body,
        input.deepLink,
      );
    } catch (error) {
      console.error("Admin push notification failed.", {
        code: (error as {code?: unknown}).code ?? "unknown",
      });
    }
  }));
}

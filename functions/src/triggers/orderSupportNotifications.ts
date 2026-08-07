/*
|--------------------------------------------------------------------------
| Order Support Notifications
|--------------------------------------------------------------------------
|
| Customer order-help requests are private conversations with LIA Admin. The
| administrator is the only bridge to the store, so customer notes are never
| delivered to a store owner and customers see only an admin response.
|
*/

import * as admin from "firebase-admin";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {
  onDocumentCreated,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";
import {
  notifyActiveAdministrators,
} from "../admin/adminNotificationService";
import {
  notificationService,
} from "../services/notificationService";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");

type Data = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function label(value: string): string {
  return value.replace(/_/g, " ");
}

function sentence(value: unknown): string {
  return text(value)
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

async function notifyCustomer(
  customerId: string,
  requestId: string,
  orderId: string,
  title: string,
  body: string
): Promise<void> {
  if (!customerId || !orderId) {
    return;
  }

  await db
    .collection("users")
    .doc(customerId)
    .collection("notifications")
    .doc(`order-support-${requestId}-admin`)
    .set({
      title,
      body,
      type: "system",
      deepLink: `/orders/${orderId}`,
      orderId,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {
      merge: true,
    });

  try {
    await notificationService.sendToUser(
      customerId,
      title,
      body,
      "/orders/" + orderId,
    );
  } catch (error) {
    console.error(
      "Order support customer push notification failed.",
      {
        requestId,
        message: error instanceof Error
          ? error.message
          : "Unknown error",
      }
    );
  }
}

export const orderSupportRequestCreated =
  onDocumentCreated(
    {
      document:
        "orderSupportRequests/{requestId}",
      region:
        "us-central1",
      database:
        "default",
    },

    async (event) => {
      const support = event.data?.data() as Data | undefined;

      if (!support) {
        return;
      }

      const requestId = event.params.requestId;
      const orderId = text(support.orderId);
      const orderNumber = text(support.orderNumber) ||
        "Unavailable";
      const topic = label(
        text(support.reason)
      );
      const customerName = text(support.customerName) ||
        "A customer";
      const customerMessage = sentence(
        support.message
      );

      await notifyActiveAdministrators({
        title: "New order support request",
        body: `Order #${orderNumber}: ${customerName} requested help for ${topic}.${customerMessage ? ` Customer note: ${customerMessage}` : ""}`,
        type: "customer",
        deepLink: `/admin/orders/${orderId}`,
        subject: {
          type: "order_support_request",
          id: requestId,
        },
        dedupeKey: `order-support-${requestId}-created`,
      });

    }
  );

export const orderSupportResponseNotification =
  onDocumentUpdated(
    {
      document:
        "orderSupportRequests/{requestId}",
      region:
        "us-central1",
      database:
        "default",
    },

    async (event) => {
      const before = event.data?.before.data() as Data | undefined;
      const after = event.data?.after.data() as Data | undefined;

      if (!before || !after) {
        return;
      }

      const beforeResponse = before.adminResponse &&
        typeof before.adminResponse === "object" &&
        !Array.isArray(before.adminResponse)
        ? before.adminResponse as Data
        : {};
      const afterResponse = after.adminResponse &&
        typeof after.adminResponse === "object" &&
        !Array.isArray(after.adminResponse)
        ? after.adminResponse as Data
        : {};
      const adminMessageBefore = text(
        beforeResponse.message
      );
      const adminMessageAfter = text(
        afterResponse.message
      );

      const response = adminMessageAfter &&
        adminMessageAfter !== adminMessageBefore
        ? {
          title: "LIA Support response",
          message: adminMessageAfter,
        }
        : null;

      if (!response) {
        return;
      }

      await notifyCustomer(
        text(after.customerId),
        event.params.requestId,
        text(after.orderId),
        response.title,
        response.message
      );
    }
  );

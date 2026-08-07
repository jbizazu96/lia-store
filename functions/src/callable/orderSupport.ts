/*
|--------------------------------------------------------------------------
| Customer Order Support
|--------------------------------------------------------------------------
|
| Support requests are separate from refund claims. They let a customer ask
| for help with an in-progress or completed paid order without creating a
| payment obligation. LIA Admin replies through protected server callables;
| the store is never exposed to the customer's private support message.
|
*/

import * as admin from "firebase-admin";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");

const CUSTOMER_SUPPORT_REASONS = new Set([
  "late_delivery",
  "missing_items",
  "contact_support",
]);

function record(value: unknown): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function identifier(
  value: unknown,
  label: string
): string {
  const result = text(value);

  if (
    !result ||
    result.includes("/") ||
    result.includes("\\")
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${label} is required.`
    );
  }

  return result;
}

function timestamp(value: unknown): string | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();

    return date instanceof Date
      ? date.toISOString()
      : null;
  }

  return typeof value === "string"
    ? value
    : null;
}

function supportRequestId(
  orderId: string,
  customerId: string
): string {
  return `customer_${customerId}_${orderId}`;
}

async function requireActiveCustomer(
  customerId: string
): Promise<void> {
  const user = await db
    .collection("users")
    .doc(customerId)
    .get();

  if (
    !user.exists ||
    user.data()?.accountType !== "customer" ||
    user.data()?.isActive === false
  ) {
    throw new HttpsError(
      "permission-denied",
      "This account is not authorized to request order support."
    );
  }
}

function mapSupportRequest(
  id: string,
  data: Record<string, unknown>
) {
  const adminResponse = record(
    data.adminResponse
  );

  return {
    id,
    orderId: text(data.orderId),
    orderNumber: text(data.orderNumber) || null,
    reason: text(data.reason),
    message: text(data.message),
    status: text(data.status) || "open",
    createdAt: timestamp(data.createdAt),
    updatedAt: timestamp(data.updatedAt),
    adminResponse: text(adminResponse.message)
      ? {
        message: text(adminResponse.message),
        respondedAt: timestamp(adminResponse.respondedAt),
      }
      : null,
  };
}

export const createCustomerOrderSupportRequest =
  onCall(
    {
      region: "us-central1",
    },

    async (request) => {
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "Sign in to request order support."
        );
      }

      const customerId = request.auth.uid;
      await requireActiveCustomer(customerId);

      const input = record(request.data);
      const orderId = identifier(
        input.orderId,
        "Order"
      );
      const reason = text(input.reason);
      const message = text(input.message);

      if (!CUSTOMER_SUPPORT_REASONS.has(reason)) {
        throw new HttpsError(
          "invalid-argument",
          "Choose a valid support topic."
        );
      }

      if (
        !message ||
        message.length > 2_000
      ) {
        throw new HttpsError(
          "invalid-argument",
          "Describe the issue using 1 to 2,000 characters."
        );
      }

      const order = await db
        .collection("orders")
        .doc(orderId)
        .get();
      const orderData = order.data() ?? {};
      const customer = record(orderData.customer);
      const payment = record(orderData.payment);
      const store = record(orderData.store);

      if (
        !order.exists ||
        text(customer.uid) !== customerId ||
        orderData.checkoutStatus !== "confirmed" ||
        text(payment.status) !== "paid" ||
        orderData.status === "cancelled"
      ) {
        throw new HttpsError(
          "not-found",
          "This paid customer order was not found."
        );
      }

      const reference = db
        .collection("orderSupportRequests")
        .doc(
          supportRequestId(
            orderId,
            customerId
          )
        );

      await db.runTransaction(
        async (transaction) => {
          const existing = await transaction.get(
            reference
          );

          if (existing.exists) {
            throw new HttpsError(
              "already-exists",
              "There is already an order-support request for this order. Review the replies below."
            );
          }

          transaction.create(reference, {
            id: reference.id,
            orderId,
            orderNumber:
              text(orderData.orderNumber) ||
              "Unavailable",
            customerId,
            customerName:
              text(customer.name) || "Customer",
            storeId: text(store.id),
            reason,
            message,
            status: "open",
            adminResponse: {
              message: null,
              respondedAt: null,
              responderId: null,
            },
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      );

      return {
        requestId: reference.id,
        status: "open",
      };
    }
  );

export const getCustomerOrderSupportRequest =
  onCall(
    {
      region: "us-central1",
    },

    async (request) => {
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "Sign in to view order support."
        );
      }

      const customerId = request.auth.uid;
      await requireActiveCustomer(customerId);

      const orderId = identifier(
        record(request.data).orderId,
        "Order"
      );
      const snapshot = await db
        .collection("orderSupportRequests")
        .doc(
          supportRequestId(
            orderId,
            customerId
          )
        )
        .get();

      return {
        request: snapshot.exists
          ? mapSupportRequest(
            snapshot.id,
            snapshot.data() ?? {}
          )
          : null,
      };
    }
  );

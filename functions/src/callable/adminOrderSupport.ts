/* Protected admin support replies for customer order-help requests. */

import * as admin from "firebase-admin";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import {
  requireAdminPermission,
} from "../admin/adminAuthorizationService";
import {
  writeAdminAuditLog,
} from "../admin/adminAuditLogService";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function identifier(value: unknown, label: string): string {
  const result = text(value);
  if (!result || result.includes("/") || result.includes("\\")) {
    throw new HttpsError("invalid-argument", `${label} is required.`);
  }
  return result;
}

function timestamp(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date ? date.toISOString() : null;
  }
  return typeof value === "string" ? value : null;
}

function response(value: unknown) {
  const data = record(value);
  return text(data.message) ? {message: text(data.message), respondedAt: timestamp(data.respondedAt)} : null;
}

async function requestForOrder(orderId: string) {
  const snapshot = await db.collection("orderSupportRequests").where("orderId", "==", orderId).limit(1).get();
  return snapshot.docs[0] ?? null;
}

export const getAdminOrderSupportRequest = onCall({region: "us-central1"}, async (request) => {
  await requireAdminPermission(request, "orders");
  const orderId = identifier(record(request.data).orderId, "Order");
  const support = await requestForOrder(orderId);
  if (!support) return {request: null};
  const data = support.data();
  return {request: {id: support.id, orderId: text(data.orderId), orderNumber: text(data.orderNumber), customerName: text(data.customerName) || "Customer", reason: text(data.reason), message: text(data.message), status: text(data.status) || "open", createdAt: timestamp(data.createdAt), adminResponse: response(data.adminResponse)}};
});

export const respondAdminOrderSupportRequest = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "orders", "write");
  const input = record(request.data);
  const requestId = identifier(input.requestId, "Support request");
  const message = text(input.message);
  const status = text(input.status);
  if (!message || message.length > 2_000) throw new HttpsError("invalid-argument", "Write a response using 1 to 2,000 characters.");
  if (!["in_review", "responded", "resolved"].includes(status)) throw new HttpsError("invalid-argument", "Choose a valid support status.");
  const reference = db.collection("orderSupportRequests").doc(requestId);
  const support = await reference.get();
  if (!support.exists) throw new HttpsError("not-found", "The order-support request was not found.");
  await reference.update({status, adminResponse: {message, respondedAt: FieldValue.serverTimestamp(), responderId: administrator.uid}, updatedAt: FieldValue.serverTimestamp()});
  await writeAdminAuditLog(administrator, {action: "order_support_replied", targetType: "order_support_request", targetId: requestId, reason: message, details: {status, orderId: text(support.data()?.orderId)}});
  return {success: true};
});

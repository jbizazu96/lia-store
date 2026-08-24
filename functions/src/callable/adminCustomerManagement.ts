/*
|--------------------------------------------------------------------------
| Admin Customer Management
|--------------------------------------------------------------------------
|
| Customer records are private. This callable-only workspace returns the
| small administrative view required to support an account, and makes every
| account-status change auditable.
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
import {
  requireAdminPermission,
} from "../admin/adminAuthorizationService";
import {
  writeAdminAuditLog,
} from "../admin/adminAuditLogService";
import {
  notificationService,
} from "../services/notificationService";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");
const CUSTOMER_PAGE_SIZE = 40;
const CUSTOMER_SCAN_SIZE = 100;
const MAX_RECENT_ORDERS = 20;

type Data = Record<string, unknown>;

function record(value: unknown): Data {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Data
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function date(value: unknown): string | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const result = value.toDate();
    return result instanceof Date ? result.toISOString() : null;
  }

  return typeof value === "string" ? value : null;
}

function customerId(value: unknown): string {
  const id = text(value);

  if (!id || id.includes("/") || id.includes("\\")) {
    throw new HttpsError("invalid-argument", "A valid customer is required.");
  }

  return id;
}

function customerName(data: Data): string {
  return text(data.displayName) || [
    text(data.firstName),
    text(data.lastName),
  ].filter(Boolean).join(" ") || "Customer";
}

function accountStatus(data: Data): "active" | "suspended" {
  return data.isActive === false ? "suspended" : "active";
}

function customerListItem(
  document: FirebaseFirestore.QueryDocumentSnapshot
) {
  const data = document.data();

  return {
    id: document.id,
    name: customerName(data),
    email: text(data.email),
    phone: text(data.phone),
    accountStatus: accountStatus(data),
    createdAt: date(data.createdAt),
    profileImageUrl: text(data.profileImageUrl) || null,
  };
}

function orderSummary(
  document: FirebaseFirestore.QueryDocumentSnapshot
) {
  const data = document.data();
  const pricing = record(data.pricing);
  const payment = record(data.payment);
  const store = record(data.store);

  return {
    id: document.id,
    orderNumber: text(data.orderNumber) || "Unavailable",
    status: text(data.status) || "pending",
    paymentStatus: text(payment.status) || "unknown",
    totalAmount: typeof pricing.totalAmount === "number"
      ? Math.max(0, pricing.totalAmount)
      : 0,
    currency: text(pricing.currency) || "usd",
    storeName: text(store.name) || "Store",
    createdAt: date(data.createdAt),
  };
}

function notificationSummary(
  document: FirebaseFirestore.QueryDocumentSnapshot
) {
  const data = document.data();

  return {
    id: document.id,
    title: text(data.title) || "Account update",
    body: text(data.body) || "",
    type: text(data.type) || "system",
    read: data.read === true,
    createdAt: date(data.createdAt),
  };
}

export const getAdminCustomers = onCall(
  { region: "us-central1" },
  async (request) => {
    await requireAdminPermission(request, "customers");
    const input = record(request.data);
    const search = text(input.search).toLowerCase();
    const status = text(input.status) || "all";
    let cursor = text(input.cursor);

    if (!["all", "active", "suspended"].includes(status)) {
      throw new HttpsError("invalid-argument", "Choose a valid account status.");
    }

    const [total, suspended] = await Promise.all([
      db.collection("users").where("accountType", "==", "customer").count().get(),
      db.collection("users").where("accountType", "==", "customer").where("isActive", "==", false).count().get(),
    ]);
    const counts = {
      total: total.data().count,
      active: total.data().count - suspended.data().count,
      suspended: suspended.data().count,
    };
    const customers: ReturnType<typeof customerListItem>[] = [];
    let exhausted = false;
    while (customers.length < CUSTOMER_PAGE_SIZE && !exhausted) {
      let query = db.collection("users")
        .where("accountType", "==", "customer")
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(CUSTOMER_SCAN_SIZE);
      if (cursor) query = query.startAfter(cursor);
      const snapshot = await query.get();
      let consumed = 0;
      for (const document of snapshot.docs) {
        consumed += 1;
        cursor = document.id;
        const item = customerListItem(document);
        const matches = (status === "all" || item.accountStatus === status) && (!search || [
          item.id, item.name, item.email, item.phone,
        ].some((value) => value.toLowerCase().includes(search)));
        if (matches) customers.push(item);
        if (customers.length >= CUSTOMER_PAGE_SIZE) break;
      }
      exhausted = consumed === snapshot.size && snapshot.size < CUSTOMER_SCAN_SIZE;
    }
    customers.sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""));

    return {customers, counts, limited: !exhausted, nextCursor: exhausted ? null : cursor};
  }
);

export const getAdminCustomer = onCall(
  { region: "us-central1" },
  async (request) => {
    await requireAdminPermission(request, "customers");
    const id = customerId(record(request.data).customerId);
    const customer = await db.collection("users").doc(id).get();
    const data = customer.data();

    if (!customer.exists || data?.accountType !== "customer") {
      throw new HttpsError("not-found", "The customer was not found.");
    }

    const [orders, notifications, deletionRequests, orderZoneRequests] = await Promise.all([
      db.collection("orders")
        .where("customer.uid", "==", id)
        .limit(MAX_RECENT_ORDERS)
        .get(),
      db.collection("users").doc(id).collection("notifications")
        .orderBy("createdAt", "desc")
        .limit(10)
        .get(),
      db.collection("accountDeletionRequests")
        .where("ownerId", "==", id)
        .limit(10)
        .get(),
      db.collection("orderZoneRequests")
        .where("customerId", "==", id)
        .limit(20)
        .get(),
    ]);
    const address = record(data.defaultAddress);
    const deletionRequest = deletionRequests.docs
      .map((document) => {
        const item = document.data();
        return {
          id: document.id,
          status: text(item.status) || "pending_review",
          requestedAt: date(item.requestedAt),
        };
      })
      .sort((left, right) => (right.requestedAt ?? "").localeCompare(left.requestedAt ?? ""))[0] ?? null;

    return {
      id,
      profile: {
        name: customerName(data),
        email: text(data.email),
        phone: text(data.phone),
        profileImageUrl: text(data.profileImageUrl) || null,
        createdAt: date(data.createdAt),
        accountStatus: accountStatus(data),
        suspensionReason: text(data.suspensionReason) || null,
      },
      address: text(address.formattedAddress) || [
        text(address.street), text(address.city), text(address.state), text(address.zip),
      ].filter(Boolean).join(", ") || null,
      zoneAssignment: {
        homeZoneId: text(data.homeZoneId) || text(address.deliveryZoneId) || null,
        orderZoneIds: Array.isArray(data.orderZoneIds) ? data.orderZoneIds.filter((value): value is string => typeof value === "string") : [],
      },
      orderZoneRequests: orderZoneRequests.docs.map((document) => {
        const item = document.data();
        return {
          id: document.id,
          customerAddress: text(item.customerAddress),
          requestedStoreCity: text(item.requestedStoreCity),
          storeName: text(item.storeName) || null,
          storeHomeZoneId: text(item.storeHomeZoneId) || null,
          status: text(item.status) || "pending_review",
          decisionMessage: text(item.decisionMessage) || null,
          createdAt: date(item.createdAt),
        };
      }).sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? "")),
      orders: orders.docs.map(orderSummary)
        .sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? "")),
      notifications: notifications.docs.map(notificationSummary),
      deletionRequest,
    };
  }
);

export const decideAdminOrderZoneRequest = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireAdminPermission(request, "customers", "write");
    const input = record(request.data);
    const requestId = customerId(input.requestId);
    const decision = text(input.decision);
    const message = text(input.message).slice(0, 1_000);
    const selectedZoneId = text(input.zoneId);
    if (!message || !["approved", "rejected"].includes(decision)) throw new HttpsError("invalid-argument", "Choose approve or decline and enter a message for the customer.");

    const reference = db.collection("orderZoneRequests").doc(requestId);
    const snapshot = await reference.get();
    const data = snapshot.data() ?? {};
    if (!snapshot.exists || data.status !== "pending_review") throw new HttpsError("failed-precondition", "This Order Zone request has already been reviewed.");
    const id = customerId(data.customerId);
    const customerReference = db.collection("users").doc(id);
    const customer = await customerReference.get();
    if (!customer.exists || customer.data()?.accountType !== "customer") throw new HttpsError("not-found", "The customer account was not found.");

    let zoneId: string | null = null;
    let zoneName: string | null = null;
    if (decision === "approved") {
      zoneId = selectedZoneId || text(data.storeHomeZoneId);
      if (!zoneId) throw new HttpsError("failed-precondition", "Choose the Order Zone to approve.");
      const zone = await db.collection("deliveryZones").doc(zoneId).get();
      if (!zone.exists || zone.data()?.isActive !== true) throw new HttpsError("failed-precondition", "Choose an active delivery zone.");
      zoneName = text(zone.data()?.name) || "Delivery zone";
    }

    const title = decision === "approved" ? "Order Zone approved" : "Order Zone request declined";
    await db.runTransaction(async (transaction) => {
      const latest = await transaction.get(reference);
      if (latest.data()?.status !== "pending_review") throw new HttpsError("failed-precondition", "This Order Zone request has already been reviewed.");
      if (decision === "approved" && zoneId) {
        const currentIds = Array.isArray(customer.data()?.orderZoneIds) ? customer.data()?.orderZoneIds.filter((value: unknown): value is string => typeof value === "string") : [];
        const currentNames = Array.isArray(customer.data()?.orderZoneNames) ? customer.data()?.orderZoneNames.filter((value: unknown): value is string => typeof value === "string") : [];
        if (!currentIds.includes(zoneId)) transaction.update(customerReference, {orderZoneIds: [...currentIds, zoneId], orderZoneNames: [...currentNames, zoneName], zoneAssignmentUpdatedAt: FieldValue.serverTimestamp(), zoneAssignmentUpdatedBy: administrator.uid, updatedAt: FieldValue.serverTimestamp()});
      }
      transaction.update(reference, {status: decision, approvedZoneId: zoneId, approvedZoneName: zoneName, decisionMessage: message, resolvedAt: FieldValue.serverTimestamp(), resolvedBy: administrator.uid, updatedAt: FieldValue.serverTimestamp()});
      transaction.set(customerReference.collection("notifications").doc(`order-zone-${requestId}`), {title, body: message, type: "system", deepLink: decision === "approved" ? "/home" : "/help", read: false, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()}, {merge: true});
    });
    try {await notificationService.sendToUser(id, title, message, decision === "approved" ? "/home" : "/help");} catch (error) {console.error("Order Zone decision push failed.", {code: (error as {code?: unknown}).code ?? "unknown"});}
    await writeAdminAuditLog(administrator, {action: `order_zone_request.${decision}`, targetType: "orderZoneRequest", targetId: requestId, reason: message, details: {customerId: id, zoneId}});
    return {success: true};
  },
);

export const setAdminCustomerSuspension = onCall(
  { region: "us-central1" },
  async (request) => {
    const administrator = await requireAdminPermission(request, "customers", "write");
    const input = record(request.data);
    const id = customerId(input.customerId);
    const isSuspended = input.isSuspended === true;
    const reason = text(input.reason);

    if (isSuspended && !reason) {
      throw new HttpsError("invalid-argument", "A suspension reason is required.");
    }

    if (reason.length > 1_000) {
      throw new HttpsError("invalid-argument", "The suspension reason is too long.");
    }

    const reference = db.collection("users").doc(id);
    const customer = await reference.get();

    if (!customer.exists || customer.data()?.accountType !== "customer") {
      throw new HttpsError("not-found", "The customer was not found.");
    }

    await reference.update(isSuspended ? {
      isActive: false,
      suspensionReason: reason,
      suspendedAt: FieldValue.serverTimestamp(),
      suspendedBy: administrator.uid,
      updatedAt: FieldValue.serverTimestamp(),
    } : {
      isActive: true,
      suspensionReason: FieldValue.delete(),
      unsuspendedAt: FieldValue.serverTimestamp(),
      unsuspendedBy: administrator.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const title = isSuspended
      ? "Your LIA account has been suspended"
      : "Your LIA account has been reinstated";
    const body = isSuspended
      ? "Your protected LIA account actions are paused. Reason: " + reason
      : "Your LIA account is active again. You can continue using protected account features.";

    await reference.collection("notifications")
      .doc(isSuspended ? "account-suspended" : "account-reinstated")
      .set({
        title,
        body,
        type: "account",
        deepLink: "/profile",
        read: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

    try {
      await notificationService.sendToUser(id, title, body, "/profile");
    } catch (error) {
      console.error("Customer account-status push notification failed.", {
        code: (error as {code?: unknown}).code ?? "unknown",
      });
    }

    await writeAdminAuditLog(administrator, {
      action: isSuspended ? "customer_suspended" : "customer_suspension_removed",
      targetType: "customer",
      targetId: id,
      reason: isSuspended ? reason : null,
    });

    return { success: true };
  }
);

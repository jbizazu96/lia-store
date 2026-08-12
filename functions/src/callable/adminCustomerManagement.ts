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
const MAX_CUSTOMERS = 100;
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

    if (!["all", "active", "suspended"].includes(status)) {
      throw new HttpsError("invalid-argument", "Choose a valid account status.");
    }

    const snapshot = await db.collection("users")
      .where("accountType", "==", "customer")
      .limit(MAX_CUSTOMERS)
      .get();
    const all = snapshot.docs.map(customerListItem);
    const counts = {
      total: all.length,
      active: all.filter((item) => item.accountStatus === "active").length,
      suspended: all.filter((item) => item.accountStatus === "suspended").length,
    };
    const customers = all
      .filter((item) => status === "all" || item.accountStatus === status)
      .filter((item) => !search || [
        item.id,
        item.name,
        item.email,
        item.phone,
      ].some((value) => value.toLowerCase().includes(search)))
      .sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""));

    return { customers, counts, limited: snapshot.size === MAX_CUSTOMERS };
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
          status: text(item.status) || "pending_review",
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

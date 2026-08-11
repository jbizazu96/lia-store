import * as admin from "firebase-admin";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {notifyActiveAdministrators} from "../admin/adminNotificationService";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");

function text(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maximum) : "";
}

export const createCustomerOrderZoneRequest = onCall(
  {region: "us-central1"},
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to request an Order Zone.");
    const input = request.data && typeof request.data === "object" ? request.data as Record<string, unknown> : {};
    const customerAddress = text(input.customerAddress, 300).toUpperCase();
    const requestedStoreCity = text(input.storeCity, 100).toUpperCase();
    const storeId = text(input.storeId, 128);
    if (customerAddress.length < 10 || requestedStoreCity.length < 2) {
      throw new HttpsError("invalid-argument", "Enter your complete delivery address and the store city.");
    }
    const customerReference = db.collection("users").doc(request.auth.uid);
    const customer = await customerReference.get();
    const customerData = customer.data() ?? {};
    if (!customer.exists || customerData.accountType !== "customer" || customerData.isActive === false ||
      ["deletion_pending", "deletion_processing"].includes(String(customerData.accountDeletionState ?? ""))) {
      throw new HttpsError("permission-denied", "This account cannot submit an Order Zone request.");
    }
    let storeName: string | null = null;
    let storeHomeZoneId: string | null = null;
    if (storeId) {
      const store = await db.collection("stores").doc(storeId).get();
      if (!store.exists || store.data()?.isActive !== true || store.data()?.isApproved !== true) {
        throw new HttpsError("not-found", "The selected store is not currently available.");
      }
      storeName = text(store.data()?.name, 100) || null;
      storeHomeZoneId = text(store.data()?.homeZoneId, 128) || null;
    }
    const reference = db.collection("orderZoneRequests").doc();
    await reference.create({
      customerId: request.auth.uid,
      customerName: text(customerData.displayName, 100) || text(request.auth.token.name, 100) || "Customer",
      customerEmail: text(customerData.email, 160) || text(request.auth.token.email, 160) || null,
      customerAddress,
      customerHomeZoneId: text(customerData.homeZoneId, 128) || null,
      requestedStoreCity,
      storeId: storeId || null,
      storeName,
      storeHomeZoneId,
      status: "pending_review",
      source: "customer_help_center",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await notifyActiveAdministrators({
      title: "New Order Zone request",
      body: `${text(customerData.displayName, 100) || "A customer"} requested ordering access for ${requestedStoreCity}${storeName ? ` (${storeName})` : ""}.`,
      type: "customer",
      deepLink: "/admin/customers",
      subject: {type: "order_zone_request", id: reference.id},
      dedupeKey: `order-zone-${reference.id}`,
    });
    return {success: true, requestId: reference.id};
  },
);

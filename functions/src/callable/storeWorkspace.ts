/*
|--------------------------------------------------------------------------
| Store Workspace Callables
|--------------------------------------------------------------------------
|
| Store pages call this module instead of using Firebase Admin SDK-backed
| Vercel routes or writing stores/{storeId} from the browser. Every callable
| derives the store from the authenticated owner and validates data before
| using the Admin SDK.
|
*/

import * as admin from "firebase-admin";
import {
  AggregateField,
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import {
  defineSecret,
} from "firebase-functions/params";
import {
  grantStoreUploadClaim,
} from "../services/store/storeUploadClaimService";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");
const googleMapsApiKey = defineSecret("GOOGLE_MAPS_API_KEY");
const scheduleDays = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function upper(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeState(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

async function requireOwnedStore(uid: string) {
  const user = await db.collection("users").doc(uid).get();
  if (user.data()?.accountType !== "store_owner") {
    throw new HttpsError("permission-denied", "Only store owners can access this workspace.");
  }

  const storedId = text(user.data()?.storeId);
  if (storedId) {
    const store = await db.collection("stores").doc(storedId).get();
    if (store.exists && store.data()?.ownerId === uid) return store;
  }

  const stores = await db.collection("stores").where("ownerId", "==", uid).limit(1).get();
  const store = stores.docs[0];
  if (!store) throw new HttpsError("not-found", "No store was found for this account.");
  return store;
}

function serialize(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date ? date.toISOString() : null;
  }
  if (Array.isArray(value)) return value.map(serialize);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serialize(entry)]));
  return value;
}

function settingsStore(data: Record<string, unknown>, id: string) {
  /* Explicit allowlist: never return private owner, review, EIN, or Stripe fields. */
  return {
    id,
    name: text(data.name), email: text(data.email), phone: text(data.phone), description: text(data.description),
    address: text(data.address), city: text(data.city), state: text(data.state), zip: text(data.zip), country: text(data.country) || "US",
    formattedAddress: text(data.formattedAddress), latitude: typeof data.latitude === "number" ? data.latitude : 0,
    longitude: typeof data.longitude === "number" ? data.longitude : 0, placeId: text(data.placeId),
    logoUrl: text(data.logoUrl), bannerUrl: text(data.bannerUrl), category: text(data.category),
    rating: typeof data.rating === "number" ? data.rating : 0, isOpen: data.isOpen === true,
    schedule: Array.isArray(data.schedule) ? serialize(data.schedule) : [],
    isApproved: data.isApproved === true, isActive: data.isActive === true,
  };
}

function settingsUser(data: Record<string, unknown>) {
  return {
    displayName: text(data.displayName), email: text(data.email), phone: text(data.phone), language: text(data.language),
  };
}

function validateSchedule(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length !== scheduleDays.length) {
    throw new HttpsError("invalid-argument", "Add each day of the week to the store schedule.");
  }
  const schedule = value.map((entry) => isRecord(entry) ? entry : {});
  const names = schedule.map((entry) => text(entry.day));
  if (new Set(names).size !== scheduleDays.length || !scheduleDays.every((day) => names.includes(day))) {
    throw new HttpsError("invalid-argument", "Include every day of the week only once.");
  }
  let hasOpenDay = false;
  for (const day of schedule) {
    const isClosed = day.isClosed === true;
    const open = text(day.open);
    const close = text(day.close);
    if (!isClosed) {
      hasOpenDay = true;
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(open) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(close) || close <= open) {
        throw new HttpsError("invalid-argument", "Each open day needs valid hours with a closing time after opening.");
      }
    }
  }
  if (!hasOpenDay) throw new HttpsError("invalid-argument", "Set opening hours for at least one day.");
  return schedule.map((day) => ({ day: text(day.day), open: text(day.open), close: text(day.close), isClosed: day.isClosed === true }));
}

async function geocode(address: string) {
  const response = await fetch("https://maps.googleapis.com/maps/api/geocode/json?address=" + encodeURIComponent(address) + "&key=" + encodeURIComponent(googleMapsApiKey.value()));
  if (!response.ok) return null;
  const body = await response.json() as { status?: unknown; results?: Array<{ formatted_address?: unknown; geometry?: { location?: { lat?: unknown; lng?: unknown } } }> };
  const result = body.status === "OK" ? body.results?.[0] : null;
  const latitude = result?.geometry?.location?.lat;
  const longitude = result?.geometry?.location?.lng;
  return typeof latitude === "number" && typeof longitude === "number"
    ? { latitude, longitude, formattedAddress: text(result?.formatted_address) || address }
    : null;
}

export const getStoreWorkspaceSettings = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to open store settings.");
  const [store, user] = await Promise.all([requireOwnedStore(request.auth.uid), db.collection("users").doc(request.auth.uid).get()]);
  await grantStoreUploadClaim(request.auth.uid, store.id);
  return { store: settingsStore(store.data() ?? {}, store.id), user: settingsUser(user.data() ?? {}) };
});

export const getStoreWorkspaceEntry = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to open the store app.");
  const user = await db.collection("users").doc(request.auth.uid).get();
  if (user.data()?.accountType !== "store_owner") throw new HttpsError("permission-denied", "Only store owners can access this workspace.");
  try {
    const store = await requireOwnedStore(request.auth.uid);
    await grantStoreUploadClaim(request.auth.uid, store.id);
    const data = store.data() ?? {};
    const orders = await db.collection("orders")
      .where("store.id", "==", store.id)
      .where("checkoutStatus", "==", "confirmed")
      .where("status", "in", ["pending", "accepted", "preparing", "ready_for_pickup"])
      .get();
    const pendingOrderCount = orders.size;
    return {
      hasStore: true,
      store: {
        id: store.id,
        name: text(data.name) || "Your Store",
        logoUrl: text(data.logoUrl),
        isApproved: data.isApproved === true,
        isActive: data.isActive === true,
        onboardingCompleted: data.onboardingCompleted === true,
        onboardingStep: text(data.onboardingStep) || "owner",
      },
      pendingOrderCount,
    };
  } catch (error) {
    if (error instanceof HttpsError && error.code === "not-found") {
      return { hasStore: false, store: null, pendingOrderCount: 0 };
    }
    throw error;
  }
});

/*
 * Store orders are private operational records. Return only confirmed orders
 * after deriving the store from the authenticated owner; the browser never
 * queries orders/{orderId} or orders by store ID directly.
 */
export const getStoreWorkspaceOrders = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view store orders.");
  const store = await requireOwnedStore(request.auth.uid);
  const orders = await db.collection("orders")
    .where("store.id", "==", store.id)
    .where("checkoutStatus", "==", "confirmed")
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  return {
    orders: orders.docs.map((order) => ({
      id: order.id,
      ...(serialize(order.data()) as Record<string, unknown>),
    })),
  };
});

export const getStoreWorkspaceOrder = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view a store order.");
  const input = isRecord(request.data) ? request.data : {};
  const orderId = text(input.orderId);
  if (!orderId || orderId.includes("/")) throw new HttpsError("invalid-argument", "A valid order ID is required.");

  const store = await requireOwnedStore(request.auth.uid);
  const order = await db.collection("orders").doc(orderId).get();
  if (!order.exists || order.data()?.checkoutStatus !== "confirmed" || order.data()?.store?.id !== store.id) {
    throw new HttpsError("not-found", "The order could not be found.");
  }

  return {
    order: {
      id: order.id,
      ...(serialize(order.data()) as Record<string, unknown>),
    },
  };
});

/* Dashboard aggregates are computed server-side from confirmed orders and
 * completed store transfer obligations, never from customer checkout totals. */
export const getStoreWorkspaceDashboard = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view the store dashboard.");
  const store = await requireOwnedStore(request.auth.uid);
  const storeData = store.data() ?? {};
  const confirmedOrders = db.collection("orders")
    .where("store.id", "==", store.id)
    .where("checkoutStatus", "==", "confirmed");
  const activeOrders = db.collection("orders")
    .where("store.id", "==", store.id)
    .where("checkoutStatus", "==", "confirmed")
    .where("status", "in", ["pending", "accepted", "preparing", "ready_for_pickup"]);

  const [orderCount, pendingCount, recentOrders, completedTransfers] = await Promise.all([
    confirmedOrders.count().get(),
    activeOrders.count().get(),
    confirmedOrders.orderBy("createdAt", "desc").limit(4).get(),
    db.collection("paymentTransfers")
      .where("recipient.id", "==", store.id)
      .where("recipient.type", "==", "store")
      .where("status", "==", "completed")
      .aggregate({ total: AggregateField.sum("amount") })
      .get(),
  ]);

  const totalRevenueCents = completedTransfers.data().total ?? 0;
  const recent = recentOrders.docs.map((order) => order.data());
  const customerIds = new Set(recent.map((order) => text(isRecord(order.customer) ? order.customer.uid : "")).filter(Boolean));

  return {
    storeName: text(storeData.name) || "Your Store",
    stats: {
      totalOrders: orderCount.data().count,
      totalRevenue: totalRevenueCents / 100,
      totalCustomers: customerIds.size,
      averageRating: typeof storeData.rating === "number" ? storeData.rating : 0,
      pendingOrders: pendingCount.data().count,
      todayOrders: recent.filter((order) => {
        const createdAt = order.createdAt?.toDate?.();
        return createdAt instanceof Date && createdAt.toDateString() === new Date().toDateString();
      }).length,
      weeklyGrowth: 0,
      revenueGrowth: 0,
    },
    recentOrders: recent.map((order, index) => ({
      id: recentOrders.docs[index].id,
      customerName: text(isRecord(order.customer) ? order.customer.name : "") || "Customer",
      storeTotal: typeof order.pricing?.subtotal === "number" ? order.pricing.subtotal : 0,
      status: text(order.status) || "pending",
      createdAt: serialize(order.createdAt) as string,
      itemCount: Array.isArray(order.items) ? order.items.length : 0,
    })),
  };
});

export const getStoreWorkspaceFinancials = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view store financials.");
  const store = await requireOwnedStore(request.auth.uid);
  const transfers = db.collection("paymentTransfers")
    .where("recipient.id", "==", store.id)
    .where("recipient.type", "==", "store");
  const confirmedOrders = db.collection("orders")
    .where("store.id", "==", store.id)
    .where("checkoutStatus", "==", "confirmed");

  const [
    completedTransfers,
    pendingTransfers,
    transferHistory,
    orderCount,
    recentOrders,
  ] = await Promise.all([
    transfers.where("status", "==", "completed").aggregate({ total: AggregateField.sum("amount") }).get(),
    transfers.where("status", "in", ["pending", "eligible", "processing"]).aggregate({ total: AggregateField.sum("amount") }).get(),
    transfers.orderBy("updatedAt", "desc").limit(25).get(),
    confirmedOrders.count().get(),
    confirmedOrders.orderBy("createdAt", "desc").limit(100).get(),
  ]);

  const totalEarnings = (completedTransfers.data().total ?? 0) / 100;
  const pendingBalance = (pendingTransfers.data().total ?? 0) / 100;
  const recent = recentOrders.docs.map((order) => order.data());
  const customers = new Set(recent.map((order) => text(isRecord(order.customer) ? order.customer.uid : "")).filter(Boolean));

  return {
    analytics: {
      totalOrders: orderCount.data().count,
      totalRevenue: totalEarnings,
      averageOrderValue: orderCount.data().count ? totalEarnings / orderCount.data().count : 0,
      totalCustomers: customers.size,
      averageRating: typeof store.data()?.rating === "number" ? store.data()?.rating : 0,
      peakHours: Array(24).fill(0), dailyOrders: Array(7).fill(0), weeklyGrowth: 0, revenueGrowth: 0, topProducts: [],
    },
    earnings: {
      totalEarnings,
      /* Completed transfers have already left LIA's balance for the store. */
      availableBalance: 0,
      pendingBalance,
      weeklyEarnings: 0,
      monthlyEarnings: 0,
      payouts: transferHistory.docs.map((transfer) => {
        const data = transfer.data();
        return {
          id: transfer.id,
          amount: typeof data.amount === "number" ? data.amount / 100 : 0,
          status: text(data.status) === "completed" ? "completed" : text(data.status) === "failed" ? "failed" : "pending",
          date: String(serialize(data.completedAt ?? data.updatedAt ?? data.createdAt) ?? ""),
          method: "Stripe Transfer",
        };
      }),
    },
  };
});

export const saveStoreWorkspaceSettings = onCall({ region: "us-central1", secrets: [googleMapsApiKey] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to save store settings.");
  const payload = isRecord(request.data) ? request.data : {};
  const storeInput = isRecord(payload.store) ? payload.store : {};
  const userInput = isRecord(payload.user) ? payload.user : {};
  const name = text(storeInput.name);
  const email = text(storeInput.email);
  const phone = text(storeInput.phone);
  const description = text(storeInput.description);
  const address = text(storeInput.address);
  const city = text(storeInput.city);
  const state = normalizeState(text(storeInput.state));
  const zip = text(storeInput.zip);
  if (!name || !email.includes("@") || !phone || !description || !address || !city || !state || !zip) {
    throw new HttpsError("invalid-argument", "Complete all store details with a valid email and two-letter state.");
  }
  const location = await geocode(`${address}, ${city}, ${state} ${zip}`);
  if (!location) throw new HttpsError("invalid-argument", "We could not verify the store address.");
  const store = await requireOwnedStore(request.auth.uid);
  await store.ref.update({
    name, email, phone, description,
    address: upper(address), city: upper(city), state, zip: upper(zip), country: "US",
    formattedAddress: upper(location.formattedAddress), latitude: location.latitude, longitude: location.longitude,
    category: text(storeInput.category), isOpen: storeInput.isOpen === true,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db.collection("users").doc(request.auth.uid).set({
    displayName: text(userInput.displayName), phone: text(userInput.phone), language: text(userInput.language), updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  const [updatedStore, updatedUser] = await Promise.all([store.ref.get(), db.collection("users").doc(request.auth.uid).get()]);
  return { store: settingsStore(updatedStore.data() ?? {}, store.id), user: settingsUser(updatedUser.data() ?? {}) };
});

export const saveStoreWorkspaceSchedule = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to save store hours.");
  const schedule = validateSchedule(isRecord(request.data) ? request.data.schedule : undefined);
  const store = await requireOwnedStore(request.auth.uid);
  await store.ref.update({ schedule, updatedAt: FieldValue.serverTimestamp() });
  return { schedule };
});

/*
|--------------------------------------------------------------------------
| Customer Cart Callables
|--------------------------------------------------------------------------
|
| Cart persistence runs in Firebase Functions, not a Vercel API route. Each
| callable derives the customer ID from Firebase Authentication and verifies
| the matching customer profile before it reads or mutates carts/{uid}.
|
*/

import * as admin from "firebase-admin";
import {
  FieldValue,
  getFirestore,
  Timestamp,
} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

/*
 * A callable can be evaluated while Firebase is analyzing index.ts. Guarded
 * initialization keeps this module safe regardless of import order.
 */
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");
const CART_EXPIRY_HOURS = 48;
const MAX_CART_ITEMS = 100;
const MAX_ITEM_QUANTITY = 99;

export interface CustomerCartItem {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  imageUrl?: string;
  quantity: number;
  stock?: number;
  storeId: string;
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  storeLatitude?: number;
  storeLongitude?: number;
  size?: {
    value: number;
    unit: string;
  };
}

export type CustomerCartFulfillmentType = "delivery" | "pickup";

export interface CustomerCartState {
  items: CustomerCartItem[];
  fulfillmentType: CustomerCartFulfillmentType;
}

function normalizeFulfillmentType(value: unknown): CustomerCartFulfillmentType {
  return value === "pickup" ? "pickup" : "delivery";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function requireString(
  value: unknown,
  field: string,
  maximumLength: number
): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }

  const normalized = value.trim();

  if (!normalized || normalized.length > maximumLength) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }

  return normalized;
}

function optionalString(
  value: unknown,
  maximumLength: number
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();

  return normalized && normalized.length <= maximumLength
    ? normalized
    : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function normalizeCartItem(value: unknown): CustomerCartItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "A cart item is invalid.");
  }

  const item = value as Record<string, unknown>;
  const price = optionalNumber(item.price);
  const quantity = optionalNumber(item.quantity);
  const stock = optionalNumber(item.stock);
  const originalPrice = optionalNumber(item.originalPrice);
  const size = item.size;

  if (
    price === undefined ||
    price < 0 ||
    quantity === undefined ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_ITEM_QUANTITY ||
    (stock !== undefined &&
      (!Number.isInteger(stock) || stock < 0)) ||
    (originalPrice !== undefined && originalPrice < price)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "A cart item has invalid pricing or quantity."
    );
  }

  if (stock !== undefined && quantity > stock) {
    throw new HttpsError(
      "invalid-argument",
      "A cart quantity exceeds the available stock."
    );
  }

  const normalizedSize =
    size && typeof size === "object" && !Array.isArray(size)
      ? {
          value: optionalNumber((size as Record<string, unknown>).value),
          unit: optionalString(
            (size as Record<string, unknown>).unit,
            20
          ),
        }
      : undefined;

  if (
    normalizedSize &&
    (normalizedSize.value === undefined ||
      normalizedSize.value <= 0 ||
      !normalizedSize.unit)
  ) {
    throw new HttpsError("invalid-argument", "A cart item size is invalid.");
  }

  return {
    id: requireString(item.id, "Product", 200),
    name: requireString(item.name, "Product name", 200),
    price: Math.round(price * 100) / 100,
    ...(originalPrice !== undefined
      ? { originalPrice: Math.round(originalPrice * 100) / 100 }
      : {}),
    ...(optionalString(item.imageUrl, 4_000)
      ? { imageUrl: optionalString(item.imageUrl, 4_000) }
      : {}),
    quantity,
    ...(stock !== undefined ? { stock } : {}),
    storeId: requireString(item.storeId, "Store", 200),
    storeName: requireString(item.storeName, "Store name", 200),
    ...(optionalString(item.storeAddress, 500)
      ? { storeAddress: optionalString(item.storeAddress, 500) }
      : {}),
    ...(optionalString(item.storePhone, 40)
      ? { storePhone: optionalString(item.storePhone, 40) }
      : {}),
    ...(optionalNumber(item.storeLatitude) !== undefined
      ? { storeLatitude: optionalNumber(item.storeLatitude) }
      : {}),
    ...(optionalNumber(item.storeLongitude) !== undefined
      ? { storeLongitude: optionalNumber(item.storeLongitude) }
      : {}),
    ...(normalizedSize
      ? {
          size: {
            value: normalizedSize.value!,
            unit: normalizedSize.unit!,
          },
        }
      : {}),
  };
}

function normalizeCustomerCartItems(value: unknown): CustomerCartItem[] {
  if (!Array.isArray(value) || value.length > MAX_CART_ITEMS) {
    throw new HttpsError("invalid-argument", "The cart contains too many items.");
  }

  const items = value.map(normalizeCartItem);
  const storeId = items[0]?.storeId;

  if (storeId && items.some((item) => item.storeId !== storeId)) {
    throw new HttpsError(
      "invalid-argument",
      "A cart may contain products from only one store."
    );
  }

  return items;
}

async function requireCustomer(uid: string): Promise<void> {
  const user = await db.collection("users").doc(uid).get();
  const data = user.data();

  if (
    !user.exists ||
    data?.uid !== uid ||
    data.accountType !== "customer"
  ) {
    throw new HttpsError(
      "permission-denied",
      "This account is not authorized to manage a customer cart."
    );
  }

  if (data.isActive === false) {
    throw new HttpsError(
      "permission-denied",
      "This customer account is currently suspended. Contact support for help."
    );
  }
}

function createCartExpiration(): Timestamp {
  return Timestamp.fromDate(
    new Date(Date.now() + CART_EXPIRY_HOURS * 60 * 60 * 1_000)
  );
}

export async function loadCustomerCartState(userId: string): Promise<CustomerCartState> {
  const reference = db.collection("carts").doc(userId);
  const snapshot = await reference.get();

  if (!snapshot.exists || snapshot.data()?.userId !== userId) {
    return {items: [], fulfillmentType: "delivery"};
  }

  const expiresAt = snapshot.data()?.expiresAt;

  if (
    !(expiresAt instanceof Timestamp) ||
    expiresAt.toMillis() <= Date.now()
  ) {
    await reference.delete();
    return {items: [], fulfillmentType: "delivery"};
  }

  try {
    return {
      items: normalizeCustomerCartItems(snapshot.data()?.items ?? []),
      fulfillmentType: normalizeFulfillmentType(snapshot.data()?.fulfillmentType),
    };
  } catch {
    /* Remove malformed cart data instead of returning it to the browser. */
    await reference.delete();
    return {items: [], fulfillmentType: "delivery"};
  }
}

export async function loadCustomerCart(userId: string): Promise<CustomerCartItem[]> {
  return (await loadCustomerCartState(userId)).items;
}

export const getCustomerCart = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in again before managing your cart."
      );
    }

    await requireCustomer(request.auth.uid);

    return loadCustomerCartState(request.auth.uid);
  }
);

export const saveCustomerCart = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in again before managing your cart."
      );
    }

    await requireCustomer(request.auth.uid);

    const input = request.data as {
      items?: unknown;
      fulfillmentType?: unknown;
    } | undefined;
    const items = normalizeCustomerCartItems(input?.items);
    const fulfillmentType = normalizeFulfillmentType(input?.fulfillmentType);

    await db.collection("carts").doc(request.auth.uid).set({
      userId: request.auth.uid,
      items,
      fulfillmentType,
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: createCartExpiration(),
    });

    return { success: true };
  }
);

export const clearCustomerCart = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in again before managing your cart."
      );
    }

    await requireCustomer(request.auth.uid);
    await db.collection("carts").doc(request.auth.uid).delete();

    return { success: true };
  }
);

/*
 * Rebuild a completed customer's order from current public store/product
 * projections. Historic line-item prices and availability are never reused:
 * the cart always receives the current product price, stock, image, and
 * store details. Unavailable products are reported to the customer instead
 * of making the whole repeat-order action fail.
 */
export const repeatCustomerOrder = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in again before repeating an order.",
      );
    }

    await requireCustomer(request.auth.uid);

    const input = record(request.data);
    const orderId = optionalString(input.orderId, 200);
    if (!orderId) {
      throw new HttpsError("invalid-argument", "The completed order is invalid.");
    }

    const order = await db.collection("orders").doc(orderId).get();
    const orderData = order.data() ?? {};
    const customer = record(orderData.customer);
    const payment = record(orderData.payment);
    const sourceItems = Array.isArray(orderData.items) ? orderData.items : [];
    const store = record(orderData.store);
    const storeId = optionalString(store.id, 200);

    if (
      !order.exists ||
      customer.uid !== request.auth.uid ||
      orderData.status !== "completed" ||
      orderData.checkoutStatus !== "confirmed" ||
      payment.status !== "paid" ||
      !storeId ||
      sourceItems.length === 0 ||
      sourceItems.length > MAX_CART_ITEMS
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Only your paid, completed orders can be repeated.",
      );
    }

    const storeProfile = await db
      .collection("storePublicProfiles")
      .doc(storeId)
      .get();

    if (!storeProfile.exists) {
      throw new HttpsError(
        "failed-precondition",
        "This store is not currently available for another order.",
      );
    }

    const currentStore = storeProfile.data() ?? {};
    const requestedItems = sourceItems.flatMap((item) => {
      const source = record(item);
      const productId = optionalString(source.id, 200);
      const quantity = Math.floor(finiteNumber(source.quantity));

      return productId && quantity > 0 ? [{productId, quantity}] : [];
    });

    const productSnapshots = await db.getAll(
      ...requestedItems.map(({productId}) =>
        db.collection("productPublicProfiles").doc(productId),
      ),
    );
    const productsById = new Map(
      productSnapshots.map((snapshot) => [snapshot.id, snapshot]),
    );
    const skippedProductNames: string[] = [];
    const items: CustomerCartItem[] = [];

    for (const requested of requestedItems) {
      const product = productsById.get(requested.productId);
      const source = record(
        sourceItems.find((item) => record(item).id === requested.productId),
      );
      const productName = optionalString(source.name, 200) ?? "A product";

      if (!product?.exists) {
        skippedProductNames.push(productName);
        continue;
      }

      const data = product.data() ?? {};
      const stock = Math.max(0, Math.floor(finiteNumber(data.stock)));
      const available = data.storeId === storeId && data.isAvailable !== false && stock > 0;
      const name = optionalString(data.name, 200) ?? productName;

      if (!available) {
        skippedProductNames.push(name);
        continue;
      }

      const size = record(data.size);
      const sizeValue = finiteNumber(size.value);
      const sizeUnit = optionalString(size.unit, 20);

      items.push({
        id: product.id,
        name,
        price: Math.round(Math.max(0, finiteNumber(data.price)) * 100) / 100,
        ...(optionalString(data.imageUrl, 4_000)
          ? { imageUrl: optionalString(data.imageUrl, 4_000) }
          : {}),
        quantity: Math.min(requested.quantity, stock, MAX_ITEM_QUANTITY),
        stock,
        storeId,
        storeName: requireString(currentStore.name, "Store name", 200),
        ...(optionalString(currentStore.formattedAddress, 500) ||
          optionalString(currentStore.address, 500)
          ? {
              storeAddress: optionalString(currentStore.formattedAddress, 500) ??
                optionalString(currentStore.address, 500),
            }
          : {}),
        ...(optionalString(currentStore.phone, 40)
          ? { storePhone: optionalString(currentStore.phone, 40) }
          : {}),
        ...(typeof currentStore.latitude === "number"
          ? { storeLatitude: currentStore.latitude }
          : {}),
        ...(typeof currentStore.longitude === "number"
          ? { storeLongitude: currentStore.longitude }
          : {}),
        ...(sizeValue > 0 && sizeUnit
          ? { size: { value: sizeValue, unit: sizeUnit } }
          : {}),
      });
    }

    if (items.length === 0) {
      throw new HttpsError(
        "failed-precondition",
        "None of the products from this order are currently available.",
      );
    }

    const normalizedItems = normalizeCustomerCartItems(items);
    const fulfillmentType: CustomerCartFulfillmentType =
      orderData.fulfillmentType === "pickup" && currentStore.pickupEnabled === true
        ? "pickup"
        : "delivery";
    await db.collection("carts").doc(request.auth.uid).set({
      userId: request.auth.uid,
      items: normalizedItems,
      fulfillmentType,
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: createCartExpiration(),
    });

    return {
      items: normalizedItems,
      fulfillmentType,
      skippedProductNames: [...new Set(skippedProductNames)],
    };
  },
);

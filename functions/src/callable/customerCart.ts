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

interface CartItem {
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

function normalizeCartItem(value: unknown): CartItem {
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

function normalizeCustomerCartItems(value: unknown): CartItem[] {
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
}

function createCartExpiration(): Timestamp {
  return Timestamp.fromDate(
    new Date(Date.now() + CART_EXPIRY_HOURS * 60 * 60 * 1_000)
  );
}

async function loadCart(userId: string): Promise<CartItem[]> {
  const reference = db.collection("carts").doc(userId);
  const snapshot = await reference.get();

  if (!snapshot.exists || snapshot.data()?.userId !== userId) {
    return [];
  }

  const expiresAt = snapshot.data()?.expiresAt;

  if (
    !(expiresAt instanceof Timestamp) ||
    expiresAt.toMillis() <= Date.now()
  ) {
    await reference.delete();
    return [];
  }

  try {
    return normalizeCustomerCartItems(snapshot.data()?.items ?? []);
  } catch {
    /* Remove malformed cart data instead of returning it to the browser. */
    await reference.delete();
    return [];
  }
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

    return {
      items: await loadCart(request.auth.uid),
    };
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

    const input = request.data as { items?: unknown } | undefined;
    const items = normalizeCustomerCartItems(input?.items);

    await db.collection("carts").doc(request.auth.uid).set({
      userId: request.auth.uid,
      items,
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

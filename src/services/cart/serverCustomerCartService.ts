/*
|--------------------------------------------------------------------------
| Server Customer Cart Service
|--------------------------------------------------------------------------
|
| Cart persistence belongs behind an authenticated server boundary. Cart
| values are display-only, but the server still validates their shape so a
| browser cannot write malformed or oversized cart documents.
|
*/

import "server-only";

import {
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";

import {
  getFirebaseAdminFirestore,
} from "@/lib/firebaseAdmin";

import type {
  CartItem,
} from "@/types/cart";

const CART_EXPIRY_HOURS = 48;
const MAX_CART_ITEMS = 100;
const MAX_ITEM_QUANTITY = 99;

function requireString(
  value: unknown,
  field: string,
  maximumLength: number
): string {
  if (typeof value !== "string") {
    throw new Error(`${field} is invalid.`);
  }

  const normalized = value.trim();

  if (!normalized || normalized.length > maximumLength) {
    throw new Error(`${field} is invalid.`);
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

function optionalNumber(
  value: unknown
): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function normalizeCartItem(
  value: unknown
): CartItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("A cart item is invalid.");
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
    throw new Error("A cart item has invalid pricing or quantity.");
  }

  if (stock !== undefined && quantity > stock) {
    throw new Error("A cart quantity exceeds the available stock.");
  }

  const normalizedSize =
    size && typeof size === "object" && !Array.isArray(size)
      ? {
          value: optionalNumber((size as Record<string, unknown>).value),
          unit: optionalString((size as Record<string, unknown>).unit, 20),
        }
      : undefined;

  if (
    normalizedSize &&
    (normalizedSize.value === undefined ||
      normalizedSize.value <= 0 ||
      !normalizedSize.unit)
  ) {
    throw new Error("A cart item size is invalid.");
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

export function normalizeCustomerCartItems(
  value: unknown
): CartItem[] {
  if (!Array.isArray(value) || value.length > MAX_CART_ITEMS) {
    throw new Error("The cart contains too many items.");
  }

  const items = value.map(normalizeCartItem);
  const storeId = items[0]?.storeId;

  if (storeId && items.some((item) => item.storeId !== storeId)) {
    throw new Error("A cart may contain products from only one store.");
  }

  return items;
}

function createCartExpiration(): Timestamp {
  return Timestamp.fromDate(
    new Date(Date.now() + CART_EXPIRY_HOURS * 60 * 60 * 1_000)
  );
}

export async function loadCustomerCart(
  userId: string
): Promise<CartItem[]> {
  const cartReference = getFirebaseAdminFirestore()
    .collection("carts")
    .doc(userId);
  const snapshot = await cartReference.get();

  if (!snapshot.exists || snapshot.data()?.userId !== userId) {
    return [];
  }

  const expiresAt = snapshot.data()?.expiresAt;

  if (!(expiresAt instanceof Timestamp) || expiresAt.toMillis() <= Date.now()) {
    await cartReference.delete();
    return [];
  }

  try {
    return normalizeCustomerCartItems(snapshot.data()?.items ?? []);
  } catch {
    /* Malformed carts are removed rather than returned to the browser. */
    await cartReference.delete();
    return [];
  }
}

export async function saveCustomerCart(
  userId: string,
  items: CartItem[]
): Promise<void> {
  await getFirebaseAdminFirestore()
    .collection("carts")
    .doc(userId)
    .set({
      userId,
      items,
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: createCartExpiration(),
    });
}

export async function clearCustomerCart(
  userId: string
): Promise<void> {
  await getFirebaseAdminFirestore()
    .collection("carts")
    .doc(userId)
    .delete();
}

/*
|--------------------------------------------------------------------------
| Customer Cart Client Service
|--------------------------------------------------------------------------
|
| Cart UI uses this client service only. The authenticated API route owns all
| Firestore reads, writes, expiry management, and customer-role checks.
|
*/

import {
  auth,
} from "@/lib/firebase";

import type {
  CartItem,
} from "@/types/cart";

export type {
  CartItem,
} from "@/types/cart";

async function authorizedRequest(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Sign in again before managing your cart.");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await user.getIdToken()}`);

  return fetch(path, {
    ...init,
    headers,
  });
}

async function requestJson<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await authorizedRequest(path, init);
  const payload = await response.json().catch(() => ({})) as {
    error?: string;
  } & T;

  if (!response.ok) {
    throw new Error(payload.error ?? "The cart request could not be completed.");
  }

  return payload;
}

function requireCurrentCustomer(
  userId: string
): void {
  if (!userId.trim() || auth.currentUser?.uid !== userId) {
    throw new Error("You are not authorized to manage this cart.");
  }
}

export async function saveCartToFirestore(
  userId: string,
  items: CartItem[]
): Promise<void> {
  requireCurrentCustomer(userId);

  await requestJson("/api/customer/cart", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
}

export async function loadCartFromFirestore(
  userId: string
): Promise<CartItem[] | null> {
  requireCurrentCustomer(userId);

  const response = await requestJson<{
    items: CartItem[];
  }>("/api/customer/cart");

  return response.items;
}

export async function clearCartFromFirestore(
  userId: string
): Promise<void> {
  requireCurrentCustomer(userId);

  await requestJson("/api/customer/cart", {
    method: "DELETE",
  });
}

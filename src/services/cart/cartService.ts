/*
|--------------------------------------------------------------------------
| Customer Cart Client Service
|--------------------------------------------------------------------------
|
| Cart UI uses this client service only. Authenticated Firebase callable
| Functions own Firestore reads, writes, expiry management, and customer-role
| checks.
|
*/

import {
  auth,
  functions,
} from "@/lib/firebase";
import {
  httpsCallable,
} from "firebase/functions";

import type {
  CartItem,
} from "@/types/cart";
import type {FulfillmentType} from "@/types/fulfillment";

export type {
  CartItem,
} from "@/types/cart";

async function call<T>(
  name: string,
  data?: unknown
): Promise<T> {
  try {
    const callable = httpsCallable<unknown, T>(
      functions,
      name
    );
    const result = await callable(data);

    return result.data;
  } catch (error) {
    const functionError = error as {
      message?: unknown;
    };

    throw new Error(
      typeof functionError.message === "string"
        ? functionError.message
        : "The cart request could not be completed."
    );
  }
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
  items: CartItem[],
  fulfillmentType: FulfillmentType,
): Promise<void> {
  requireCurrentCustomer(userId);

  await call("saveCustomerCart", {items, fulfillmentType});
}

export async function loadCartFromFirestore(
  userId: string
): Promise<CartItem[] | null> {
  requireCurrentCustomer(userId);

  const response = await call<{
    items: CartItem[];
  }>("getCustomerCart");

  return response.items;
}

export async function loadCartStateFromFirestore(
  userId: string,
): Promise<{items: CartItem[]; fulfillmentType: FulfillmentType}> {
  requireCurrentCustomer(userId);
  return call("getCustomerCart");
}

export async function clearCartFromFirestore(
  userId: string
): Promise<void> {
  requireCurrentCustomer(userId);

  await call("clearCustomerCart");
}

export async function repeatCompletedOrderInCart(
  userId: string,
  orderId: string,
): Promise<{
  items: CartItem[];
  fulfillmentType: FulfillmentType;
  skippedProductNames: string[];
}> {
  requireCurrentCustomer(userId);

  return call("repeatCustomerOrder", {orderId});
}

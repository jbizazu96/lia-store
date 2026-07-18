/*
|--------------------------------------------------------------------------
| Cart Service
|--------------------------------------------------------------------------
|
| Responsible for:
|
| • Saving the signed-in customer's cart
| • Loading the signed-in customer's cart
| • Clearing the signed-in customer's cart
| • Refreshing the cart's 48-hour expiration time
| • Defensively deleting an expired cart when it is loaded
|
| Global expired-cart cleanup is handled by the scheduled
| Firebase Cloud Function.
|
*/

import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

/**
 * Number of hours a saved cart remains available after its latest update.
 */
const CART_EXPIRY_HOURS = 48;

/**
 * One product stored in the customer's cart.
 */
export interface CartItem {
  id: string;

  name: string;

  price: number;

  imageUrl?: string;

  quantity: number;

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

/**
 * Cart document as it exists after being read from Firestore.
 */
interface CartDocumentData {
  userId: string;

  items: CartItem[];

  updatedAt?: Timestamp;

  /**
   * Cart expiration time.
   *
   * Every cart update extends this by another 48 hours.
   */
  expiresAt?: Timestamp;
}

/**
 * Build the expiration timestamp for a newly saved cart.
 */
function createCartExpiration(): Timestamp {
  const expirationDate = new Date(
    Date.now() +
      CART_EXPIRY_HOURS *
        60 *
        60 *
        1000
  );

  return Timestamp.fromDate(
    expirationDate
  );
}

/**
 * Validate that a cart belongs to the user requesting it.
 *
 * The document ID already uses the user's UID, but this additional
 * check protects against malformed or incorrectly written data.
 */
function belongsToUser(
  cart: CartDocumentData,
  userId: string
): boolean {
  return cart.userId === userId;
}

/**
 * Save or replace a customer's cart.
 *
 * Saving the cart refreshes its expiration time to 48 hours
 * from the latest update.
 */
export async function saveCartToFirestore(
  userId: string,
  items: CartItem[]
): Promise<void> {
  if (!userId.trim()) {
    throw new Error(
      "A user ID is required to save a cart."
    );
  }

  const cartReference = doc(
    db,
    "carts",
    userId
  );

  try {
    await setDoc(cartReference, {
      userId,
      items,
      updatedAt: serverTimestamp(),
      expiresAt: createCartExpiration(),
    });
  } catch (error) {
    console.error(
      "Error saving cart to Firestore:",
      error
    );

    throw error;
  }
}

/**
 * Load the signed-in customer's saved cart.
 *
 * This function can only read:
 *
 * carts/{userId}
 *
 * It never queries another customer's cart.
 */
export async function loadCartFromFirestore(
  userId: string
): Promise<CartItem[] | null> {
  if (!userId.trim()) {
    return null;
  }

  const cartReference = doc(
    db,
    "carts",
    userId
  );

  try {
    const cartSnapshot =
      await getDoc(cartReference);

    if (!cartSnapshot.exists()) {
      return null;
    }

    const cart =
      cartSnapshot.data() as CartDocumentData;

    if (!belongsToUser(cart, userId)) {
      console.error(
        "Cart document does not belong to the signed-in customer."
      );

      return null;
    }

    /**
     * A missing expiration timestamp is treated as expired.
     *
     * This prevents old or malformed carts from remaining forever.
     */
    const expirationDate =
      cart.expiresAt?.toDate() ??
      new Date(0);

    if (expirationDate.getTime() <= Date.now()) {
      await deleteDoc(cartReference);
      return null;
    }

    return Array.isArray(cart.items)
      ? cart.items
      : [];
  } catch (error) {
    console.error(
      "Error loading cart from Firestore:",
      error
    );

    throw error;
  }
}

/**
 * Delete the signed-in customer's cart.
 */
export async function clearCartFromFirestore(
  userId: string
): Promise<void> {
  if (!userId.trim()) {
    return;
  }

  try {
    await deleteDoc(
      doc(db, "carts", userId)
    );
  } catch (error) {
    console.error(
      "Error clearing cart from Firestore:",
      error
    );

    throw error;
  }
}
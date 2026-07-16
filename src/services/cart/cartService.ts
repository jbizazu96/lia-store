/*
  Cart Service - Handles cart persistence in Firestore.
  Items are saved for 48 hours before automatic cleanup.
*/

import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  deleteDoc, 
  query, 
  where, 
  getDocs,
  serverTimestamp,
  Timestamp 
} from "firebase/firestore";
import { db } from "@/lib/firebase";

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

export interface CartData {
  userId: string;
  items: CartItem[];
  updatedAt: Timestamp;
  expiresAt: Timestamp; // 48 hours from last update
}

const CART_EXPIRY_HOURS = 48;

/**
 * Save cart to Firestore
 */
export async function saveCartToFirestore(userId: string, items: CartItem[]): Promise<void> {
  if (!userId) return;

  try {
    const cartRef = doc(db, "carts", userId);
    const now = new Date();
    const expiryDate = new Date(now.getTime() + CART_EXPIRY_HOURS * 60 * 60 * 1000);

    await setDoc(cartRef, {
      userId,
      items,
      updatedAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiryDate),
    }, { merge: true });
  } catch (error) {
    console.error("Error saving cart to Firestore:", error);
  }
}

/**
 * Load cart from Firestore
 */
export async function loadCartFromFirestore(userId: string): Promise<CartItem[] | null> {
  if (!userId) return null;

  try {
    const cartRef = doc(db, "carts", userId);
    const cartDoc = await getDoc(cartRef);

    if (cartDoc.exists()) {
      const data = cartDoc.data() as CartData;
      
      // Check if cart has expired
      const now = new Date();
      const expiresAt = data.expiresAt?.toDate?.() || new Date(0);
      
      if (expiresAt < now) {
        // Cart expired - delete it
        await deleteDoc(cartRef);
        return null;
      }

      return data.items || [];
    }
    return null;
  } catch (error) {
    console.error("Error loading cart from Firestore:", error);
    return null;
  }
}

/**
 * Clear cart from Firestore
 */
export async function clearCartFromFirestore(userId: string): Promise<void> {
  if (!userId) return;

  try {
    const cartRef = doc(db, "carts", userId);
    await deleteDoc(cartRef);
  } catch (error) {
    console.error("Error clearing cart from Firestore:", error);
  }
}

/**
 * Clean up expired carts (can be called periodically)
 */
export async function cleanupExpiredCarts(): Promise<void> {
  try {
    const cartsRef = collection(db, "carts");
    const now = new Date();
    const q = query(cartsRef, where("expiresAt", "<", now));
    const snapshot = await getDocs(q);

    const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));
    await Promise.all(deletePromises);

    console.log(`Cleaned up ${snapshot.size} expired carts`);
  } catch (error) {
    console.error("Error cleaning up expired carts:", error);
  }
}
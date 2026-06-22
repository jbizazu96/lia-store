/*
  Post-login service.

  Handles routing logic after successful login.
  Checks account type and store status for store owners.
*/

import {doc, getDoc, updateDoc, collection, query, where, getDocs} from "firebase/firestore";
import {auth, db} from "@/lib/firebase";

interface PostLoginResult {
  accountType: "customer" | "store_owner" | "admin";
  hasAddress: boolean;
  storeStatus: "active" | "pending" | "none";
  storeName?: string;
  storeId?: string;
}

export async function handlePostLogin(uid: string): Promise<PostLoginResult> {
  /*
    Get user data from Firestore.
  */
  const userRef = doc(db, "users", uid);
  const userDoc = await getDoc(userRef);

  if (!userDoc.exists()) {
    throw new Error("User profile not found. Please contact support.");
  }

  const userData = userDoc.data();
  const accountType = userData.accountType || "customer";

  /*
    Check if user has an address (for customers).
  */
  let hasAddress = false;
  if (accountType === "customer") {
    const addressRef = doc(db, "addresses", uid);
    const addressDoc = await getDoc(addressRef);
    hasAddress = addressDoc.exists() && !!addressDoc.data()?.street;
  }

  /*
    Check store status for store owners.
    Query by ownerId since store ID is not the same as user UID.
  */
  let storeStatus: "active" | "pending" | "none" = "none";
  let storeName = "";
  let storeId = "";

  if (accountType === "store_owner") {
    // Query stores collection where ownerId == uid
    const storesRef = collection(db, "stores");
    const q = query(storesRef, where("ownerId", "==", uid));
    const storeSnapshot = await getDocs(q);

    if (!storeSnapshot.empty) {
      // Get the first store (should only be one)
      const storeDoc = storeSnapshot.docs[0];
      const storeData = storeDoc.data();
      storeId = storeDoc.id;
      storeName = storeData.name || "Your Store";
      storeStatus = storeData.status === "active" ? "active" : "pending";
    }
  }

  return {
    accountType,
    hasAddress,
    storeStatus,
    storeName,
    storeId,
  };
}
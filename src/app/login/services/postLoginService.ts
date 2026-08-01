/*
  Post-login service.

  Handles routing logic after successful login.
  Checks account type and store status for store owners.
*/

import {doc, getDoc} from "firebase/firestore";
import {db} from "@/lib/firebase";
import {userService} from "@/services/user/userService";
import {storeWorkspaceClientService} from "@/services/store/storeWorkspaceClientService";

interface PostLoginResult {
  accountType: "customer" | "store_owner" | "driver" | "admin";
  hasAddress: boolean;
  storeStatus: "approved" | "pending" | "none";
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
    hasAddress = await userService.hasDefaultDeliveryAddress(uid);
  }

  /*
    Check store status for store owners.
    Query by ownerId since store ID is not the same as user UID.
  */
  let storeStatus: "approved" | "pending" | "none" = "none";
  let storeName = "";
  let storeId = "";

  if (accountType === "store_owner") {
    const entry = await storeWorkspaceClientService.getEntry();

    if (entry.hasStore && entry.store) {
      storeId = entry.store.id;
      storeName = entry.store.name || "Your Store";
      storeStatus = entry.store.isApproved ? "approved" : "pending";
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

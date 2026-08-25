/*
 * Minimal trusted account context for route guards and post-login routing.
 * The browser never reads users/{uid} or admins/{uid} to decide which LIA
 * application it may enter.
 */

import * as admin from "firebase-admin";
import {
  getFirestore,
} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import {
  requireActiveAdmin,
} from "../admin/adminAuthorizationService";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");

export type ApplicationAccountType =
  | "customer"
  | "store_owner"
  | "store_staff"
  | "driver"
  | "admin";

function isApplicationAccountType(
  value: unknown,
): value is Exclude<ApplicationAccountType, "admin"> {
  return value === "customer" ||
    value === "store_owner" ||
    value === "store_staff" ||
    value === "driver";
}

export const getCurrentAccount = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in to continue.",
      );
    }

    /*
     * Admin provisioning is separate from ordinary application profiles.
     * Only attempt admin authorization when this UID has an admin record.
     * Otherwise a real admin denial (unverified email, disabled record, or
     * mismatched email) would be swallowed and misreported as an incomplete
     * ordinary user profile.
     */
    const administrator = await db
      .collection("admins")
      .doc(request.auth.uid)
      .get();

    if (administrator.exists) {
      await requireActiveAdmin(request);
      return { accountType: "admin" as const };
    }

    const user = await db.collection("users").doc(request.auth.uid).get();
    const accountType = user.data()?.accountType;

    if (!user.exists || !isApplicationAccountType(accountType)) {
      throw new HttpsError(
        "failed-precondition",
        "Your account profile is incomplete. Please contact support.",
      );
    }

    if (["deletion_pending", "deletion_processing"]
      .includes(user.data()?.accountDeletionState)) {
      throw new HttpsError(
        "permission-denied",
        "Your account deletion request is under review. Account access is unavailable unless the request is rejected or reinstated."
      );
    }

    if (user.data()?.isActive === false) {
      throw new HttpsError(
        "permission-denied",
        "This account is currently suspended. Please contact support.",
      );
    }

    return { accountType };
  },
);

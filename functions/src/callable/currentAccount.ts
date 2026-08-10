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
  | "driver"
  | "admin";

function isApplicationAccountType(
  value: unknown,
): value is Exclude<ApplicationAccountType, "admin"> {
  return value === "customer" ||
    value === "store_owner" ||
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

    /* Admin provisioning is separate from ordinary application profiles. */
    try {
      await requireActiveAdmin(request);
      return { accountType: "admin" as const };
    } catch (error) {
      if (!(error instanceof HttpsError) || error.code !== "permission-denied") {
        throw error;
      }
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

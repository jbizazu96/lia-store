/*
|--------------------------------------------------------------------------
| Admin Authorization Service
|--------------------------------------------------------------------------
|
| An administrator is provisioned manually: Firebase Authentication creates
| the email/password account and an operator creates admins/{uid}. Browser
| role data is never accepted as proof of administrative access.
|
*/

import * as admin from "firebase-admin";
import {
  getFirestore,
} from "firebase-admin/firestore";
import {
  HttpsError,
} from "firebase-functions/v2/https";
import type {
  CallableRequest,
} from "firebase-functions/v2/https";

/* This module can load before index.ts during deployment analysis. */
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");

export interface ActiveAdmin {
  uid: string;
  email: string;
  role: string;
}

function normalizedEmail(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
}

/*
 * The admins collection uses the Firebase Authentication UID as its document
 * ID. The matching email is retained for human review and prevents a record
 * created for one email from authorizing a different signed-in account.
 */
export async function requireActiveAdmin(
  request: CallableRequest<unknown>
): Promise<ActiveAdmin> {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Sign in to access the admin workspace."
    );
  }

  const email = normalizedEmail(request.auth.token.email);

  if (!email || request.auth.token.email_verified !== true) {
    throw new HttpsError(
      "permission-denied",
      "A verified administrator email is required."
    );
  }

  const admin = await db
    .collection("admins")
    .doc(request.auth.uid)
    .get();

  const data = admin.data();

  if (
    !admin.exists ||
    data?.isActive !== true ||
    normalizedEmail(data?.email) !== email
  ) {
    throw new HttpsError(
      "permission-denied",
      "This account is not authorized to access the admin workspace."
    );
  }

  return {
    uid: request.auth.uid,
    email,
    role: typeof data?.role === "string" && data.role.trim()
      ? data.role.trim()
      : "super_admin",
  };
}

/*
|--------------------------------------------------------------------------
| Server Customer Profile Authorization
|--------------------------------------------------------------------------
|
| Firebase Admin bypasses Firestore rules. Customer profile routes must
| therefore derive identity from the verified ID token and confirm that the
| matching user document is a customer account before accessing any data.
|
*/

import "server-only";

import {
  getFirebaseAdminFirestore,
} from "@/lib/firebaseAdmin";

export class CustomerProfileAuthorizationError extends Error {
  constructor(message: string) {
    super(message);

    this.name = "CustomerProfileAuthorizationError";
  }
}

export async function requireCustomerProfileOwner(
  userId: string
) {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    throw new CustomerProfileAuthorizationError(
      "Sign in again before managing your profile."
    );
  }

  const userReference = getFirebaseAdminFirestore()
    .collection("users")
    .doc(normalizedUserId);
  const userSnapshot = await userReference.get();
  const userData = userSnapshot.data();

  if (
    !userSnapshot.exists ||
    !userData ||
    userData.uid !== normalizedUserId ||
    userData.accountType !== "customer"
  ) {
    throw new CustomerProfileAuthorizationError(
      "This account is not authorized to manage a customer profile."
    );
  }

  return {
    userId: normalizedUserId,
    userReference,
    userData,
  };
}

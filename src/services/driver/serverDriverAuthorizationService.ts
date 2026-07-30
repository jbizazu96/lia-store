/*
|--------------------------------------------------------------------------
| Server Driver Authorization Service
|--------------------------------------------------------------------------
|
| Firebase Admin bypasses Firestore rules. Every driver Stripe request must
| therefore derive the driver ID from the verified Firebase token and verify
| that users/{uid} is a driver and drivers/{uid} belongs to that same user.
|
*/

import "server-only";

import {
  getFirebaseAdminFirestore,
} from "@/lib/firebaseAdmin";

export class DriverAuthorizationError extends Error {
  constructor(
    readonly code: "DRIVER_NOT_FOUND" | "DRIVER_FORBIDDEN" | "DRIVER_INVALID",
    message: string
  ) {
    super(message);
    this.name = "DriverAuthorizationError";
  }
}

export interface AuthorizedDriver {
  id: string;
  ownerUid: string;
  fullName: string;
  email: string;
  phone?: string;
  stripeAccountId?: string;
  stripeConnectApiVersion?: string;
  stripeConnectedAt?: string;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new DriverAuthorizationError("DRIVER_INVALID", `Your driver application is missing ${field}.`);
  }

  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalTimestampAsIso(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();

    return date instanceof Date && !Number.isNaN(date.getTime())
      ? date.toISOString()
      : undefined;
  }

  return undefined;
}

async function requireOwnedDriver(uid: string): Promise<AuthorizedDriver> {
  const normalizedUid = uid.trim();

  if (!normalizedUid) {
    throw new DriverAuthorizationError("DRIVER_FORBIDDEN", "Sign in again before managing driver payouts.");
  }

  const firestore = getFirebaseAdminFirestore();
  const [userSnapshot, driverSnapshot] = await Promise.all([
    firestore.collection("users").doc(normalizedUid).get(),
    firestore.collection("drivers").doc(normalizedUid).get(),
  ]);

  if (userSnapshot.data()?.accountType !== "driver") {
    throw new DriverAuthorizationError("DRIVER_FORBIDDEN", "This account is not registered as a driver.");
  }

  if (!driverSnapshot.exists) {
    throw new DriverAuthorizationError("DRIVER_NOT_FOUND", "Complete your driver application before setting up payouts.");
  }

  const data = driverSnapshot.data();

  if (data?.ownerUid !== normalizedUid) {
    throw new DriverAuthorizationError("DRIVER_FORBIDDEN", "You do not have permission to manage this driver application.");
  }

  return {
    id: driverSnapshot.id,
    ownerUid: normalizedUid,
    fullName: `${requiredString(data.firstName, "a first name")} ${requiredString(data.lastName, "a last name")}`,
    email: requiredString(data.email, "an email address"),
    phone: optionalString(data.phone),
    stripeAccountId: optionalString(data.stripeAccountId),
    stripeConnectApiVersion: optionalString(data.stripeConnectApiVersion),
    stripeConnectedAt: optionalTimestampAsIso(data.stripeConnectedAt),
  };
}

export function isDriverAuthorizationError(error: unknown): error is DriverAuthorizationError {
  return error instanceof DriverAuthorizationError;
}

export const serverDriverAuthorizationService = {
  requireOwnedDriver,
};

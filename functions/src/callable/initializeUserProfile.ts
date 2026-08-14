/*
|--------------------------------------------------------------------------
| User Profile Initialization Callable
|--------------------------------------------------------------------------
|
| Firebase Authentication creates the credential in the browser, but the
| initial Firestore profile is created here. This keeps account lifecycle
| fields out of the registration UI and prevents a client from assigning
| itself an administrator account.
|
*/

import * as admin from "firebase-admin";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import {
  getFirestore,
} from "firebase-admin/firestore";
import {getCurrentCustomerLegalDocuments} from "../legal/customerLegalConfig";

type RegistrationAccountType =
  | "customer"
  | "store_owner"
  | "driver";

interface InitializeUserProfileData {
  fullName?: string;
  phone?: string;
  accountType?: RegistrationAccountType;
  customerTermsAccepted?: boolean;
  customerPrivacyAcknowledged?: boolean;
}

const ALLOWED_ACCOUNT_TYPES: RegistrationAccountType[] = [
  "customer",
  "store_owner",
  "driver",
];

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");

  if (digits.length !== 10) {
    throw new HttpsError(
      "invalid-argument",
      "Enter a complete 10-digit phone number."
    );
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)} - ${digits.slice(6)}`;
}

function normalizeName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (!normalized || normalized.length > 100) {
    throw new HttpsError(
      "invalid-argument",
      "Enter your full name using no more than 100 characters."
    );
  }

  return normalized;
}

/*
|--------------------------------------------------------------------------
| Callable
|--------------------------------------------------------------------------
*/

export const initializeUserProfile = onCall<InitializeUserProfileData>(
  {
    region: "us-central1",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in before creating a user profile."
      );
    }

    const accountType = request.data.accountType;

    if (!accountType || !ALLOWED_ACCOUNT_TYPES.includes(accountType)) {
      throw new HttpsError(
        "invalid-argument",
        "Choose customer, driver, or store owner account type."
      );
    }

    const fullName = normalizeName(request.data.fullName ?? "");
    const phone = normalizePhone(request.data.phone ?? "");
    const authUser = await admin.auth().getUser(request.auth.uid);

    if (accountType === "customer" && request.data.customerTermsAccepted !== true) {
      throw new HttpsError("failed-precondition", "Accept the LIA Customer Terms of Service before creating a customer profile.");
    }
    if (accountType === "customer" && request.data.customerPrivacyAcknowledged !== true) {
      throw new HttpsError("failed-precondition", "Acknowledge the LIA Privacy Policy before creating a customer profile.");
    }

    if (!authUser.email || !authUser.email.includes("@")) {
      throw new HttpsError(
        "failed-precondition",
        "A valid email address is required to create a profile."
      );
    }

    const userReference = getFirestore("default")
      .collection("users")
      .doc(request.auth.uid);
    const existing = await userReference.get();

    /*
      Retrying registration after a temporary network failure is safe. The
      existing profile is never overwritten or allowed to change account type.
    */
    if (existing.exists) {
      const existingType = existing.data()?.accountType;

      if (existingType !== accountType) {
        throw new HttpsError(
          "failed-precondition",
          "This account already has a different account type."
        );
      }

      return {
        created: false,
        accountType: existingType,
      };
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const firestore = getFirestore("default");
    const currentLegalDocuments = accountType === "customer" ? await getCurrentCustomerLegalDocuments(firestore) : [];
    const legalAcceptances = Object.fromEntries(currentLegalDocuments.filter((document) => document.requiresAcceptance).map((document) => [document.acceptanceField, {accepted: true, ...document, acceptedByUid: request.auth!.uid, acceptedByEmail: authUser.email!.trim().toLowerCase(), acceptedAt: now, source: "registration"}]));
    const batch = firestore.batch();
    batch.create(userReference, {
      uid: request.auth.uid,
      displayName: fullName,
      email: authUser.email.trim().toLowerCase(),
      phone,
      accountType,
      role: accountType,
      isActive: true,
      emailVerified: authUser.emailVerified,
      emailVerifiedAt: authUser.emailVerified
        ? admin.firestore.FieldValue.serverTimestamp()
        : null,
      onboardingCompleted: accountType === "customer",
      ...(currentLegalDocuments.length > 0 ? {legalAcceptances} : {}),
      createdAt: now,
      updatedAt: now,
    });
    for (const acceptance of Object.values(legalAcceptances)) batch.set(userReference.collection("legalAcceptanceAudit").doc(), {...acceptance, createdAt: now});
    await batch.commit();

    return {
      created: true,
      accountType,
    };
  }
);

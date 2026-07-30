/*
|--------------------------------------------------------------------------
| Driver Stripe Connect Persistence
|--------------------------------------------------------------------------
|
| Stores a safe Accounts v2 status summary under drivers/{uid}. Stripe owns
| all bank and identity details; Firestore stores only operational readiness.
|
*/

import "server-only";

import {
  getFirebaseAdminFirestore,
} from "@/lib/firebaseAdmin";
import {
  Timestamp,
} from "firebase-admin/firestore";
import type {
  StripeConnectAccount,
} from "@/types/stripeConnect";

function timestampFromIso(value: string, fieldName: string): Timestamp {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Stripe returned an invalid ${fieldName} timestamp.`);
  }

  return Timestamp.fromDate(date);
}

export const driverStripeConnectPersistenceService = {
  async saveAuthorizedDriverAccount(
    account: StripeConnectAccount,
    expectedDriverId: string
  ): Promise<void> {
    if (account.ownerType !== "driver" || account.ownerId !== expectedDriverId) {
      throw new Error("The Stripe account does not belong to this driver.");
    }

    const firestore = getFirebaseAdminFirestore();
    const reference = firestore.collection("drivers").doc(expectedDriverId);

    await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const data = snapshot.data();

      if (!snapshot.exists || data?.ownerUid !== expectedDriverId) {
        throw new Error("The driver application could not be verified.");
      }

      const existingAccountId = typeof data?.stripeAccountId === "string"
        ? data.stripeAccountId.trim()
        : "";

      if (existingAccountId && existingAccountId !== account.accountId) {
        throw new Error("This driver is already connected to a different Stripe account.");
      }

      transaction.update(reference, {
        stripeAccountId: account.accountId,
        stripeConnectApiVersion: "v2",
        stripeConnect: {
          status: account.onboardingStatus,
          transfersEnabled: account.transfersEnabled,
          payoutsEnabled: account.payoutsEnabled,
        },
        stripeAccountStatus: account.onboardingStatus,
        stripeChargesEnabled: account.chargesEnabled,
        stripeTransfersEnabled: account.transfersEnabled,
        stripePayoutsEnabled: account.payoutsEnabled,
        stripeDetailsSubmitted: account.detailsSubmitted,
        stripeRequiresAction: account.onboardingStatus === "action_required" || account.onboardingStatus === "restricted",
        stripeIsReady: account.onboardingStatus === "complete",
        stripeConnectedAt: timestampFromIso(account.connectedAt, "connection"),
        stripeUpdatedAt: timestampFromIso(account.updatedAt, "update"),
      });
    });
  },
};

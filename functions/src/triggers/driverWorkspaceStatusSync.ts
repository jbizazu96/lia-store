/*
|--------------------------------------------------------------------------
| Driver Workspace Status Synchronization
|--------------------------------------------------------------------------
|
| Driver records contain identity, address, vehicle, document URLs, and
| Stripe information. This separate owner-keyed projection contains only the
| status cards the driver needs to see update instantly.
|
*/

import {
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function documentStatus(label: string, value: unknown) {
  const document = record(value);
  const reviewStatus = text(document.reviewStatus);

  return {
    label,
    reviewStatus: ["pending", "approved", "rejected", "expired"].includes(reviewStatus)
      ? reviewStatus
      : "missing",
    expirationDate: text(document.expirationDate) || null,
  };
}

export const driverWorkspaceStatusSync = onDocumentWritten(
  {
    document: "drivers/{driverId}",
    region: "us-central1",
    database: "default",
  },
  async (event) => {
    const after = event.data?.after;
    const source = after?.exists ? after.data() : undefined;
    const ownerUid = text(source?.ownerUid);
    const previousOwnerUid = text(event.data?.before.exists
      ? event.data.before.data()?.ownerUid
      : undefined);

    if (!ownerUid) {
      if (previousOwnerUid) {
        await getFirestore("default")
          .collection("driverWorkspaceStatuses")
          .doc(previousOwnerUid)
          .delete();
      }
      return;
    }

    if (previousOwnerUid && previousOwnerUid !== ownerUid) {
      await getFirestore("default")
        .collection("driverWorkspaceStatuses")
        .doc(previousOwnerUid)
        .delete();
    }

    await getFirestore("default")
      .collection("driverWorkspaceStatuses")
      .doc(ownerUid)
      .set(
        {
          onboardingCompleted: source?.onboardingCompleted === true,
          onboardingStep: text(source?.onboardingStep) || "personal-information",
          status: text(source?.status) || "draft",
          isApproved: source?.isApproved === true,
          stripe: {
            status: text(source?.stripeAccountStatus) || "not_started",
            transfersEnabled: source?.stripeTransfersEnabled === true,
            payoutsEnabled: source?.stripePayoutsEnabled === true,
            requiresAction: source?.stripeRequiresAction === true,
          },
          documents: [
            documentStatus("Driver license", source?.driversLicense),
            documentStatus("Vehicle insurance", source?.vehicleInsurance),
            documentStatus("Vehicle registration", source?.vehicleRegistration),
          ],
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  },
);

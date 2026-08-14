/*
|--------------------------------------------------------------------------
| Store Workspace Status Synchronization
|--------------------------------------------------------------------------
|
| The private stores document includes owner identity, Stripe data, business
| registration, and review material. This projection lets the authenticated
| owner receive only lifecycle changes (approval, activation, and opening
| status) in real time without exposing that private document to the browser.
|
*/

import {
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

interface StoreWorkspaceStatusSource {
  ownerId?: unknown;
  onboardingCompleted?: unknown;
  onboardingStep?: unknown;
  status?: unknown;
  isApproved?: unknown;
  isActive?: unknown;
  isOpen?: unknown;
  applicationReview?: unknown;
  suspension?: unknown;
  approvalRevokedAt?: unknown;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export const storeWorkspaceStatusSync = onDocumentWritten(
  {
    document: "stores/{storeId}",
    region: "us-central1",
    database: "default",
  },
  async (event) => {
    const storeId = event.params.storeId;
    const after = event.data?.after;
    const source = after?.exists
      ? after.data() as StoreWorkspaceStatusSource
      : undefined;
    const ownerId = text(source?.ownerId);
    const previousOwnerId = text(
      event.data?.before.exists
        ? (event.data.before.data() as StoreWorkspaceStatusSource).ownerId
        : undefined,
    );

    /* A deleted store should no longer have a workspace status document. */
    if (!ownerId) {
      if (event.data?.before.exists) {
        if (previousOwnerId) {
          await getFirestore("default")
            .collection("storeWorkspaceStatuses")
            .doc(previousOwnerId)
            .delete();
        }
      }

      return;
    }

    if (previousOwnerId && previousOwnerId !== ownerId) {
      await getFirestore("default")
        .collection("storeWorkspaceStatuses")
        .doc(previousOwnerId)
        .delete();
    }

    await getFirestore("default")
      .collection("storeWorkspaceStatuses")
      .doc(ownerId)
      .set(
        {
          rejectionReason: text(record(source?.applicationReview).reason) || null,
          suspensionReason: text(record(source?.suspension).reason) || null,
          approvalRevoked: Boolean(source?.approvalRevokedAt),
          storeId,
          onboardingCompleted: source?.onboardingCompleted === true,
          onboardingStep: text(source?.onboardingStep) || "owner",
          status: text(source?.status) || "draft",
          isApproved: source?.isApproved === true,
          isActive: source?.isActive === true,
          isOpen: source?.isOpen === true,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  },
);

/*
|--------------------------------------------------------------------------
| Account Deletion Approval Service
|--------------------------------------------------------------------------
|
| Responsible for administrative decisions regarding account deletion
| requests.
|
| This service DOES NOT delete any account.
|
| Responsibilities:
|
| • Approve a request
| • Reject a request
| • Request more information
| • Record administrator information
| • Schedule future deletion
|
*/

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

export type AccountDeletionDecision =
  | "approved"
  | "rejected"
  | "more_information_required";

export interface ReviewAccountDeletionRequestInput {
  requestId: string;

  adminId: string;

  decision: AccountDeletionDecision;

  notes?: string | null;

  scheduledDeletionAt?: Date | null;
}

export class AccountDeletionApprovalError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);

    this.name =
      "AccountDeletionApprovalError";
  }
}

export const accountDeletionApprovalService = {
  async reviewRequest(
    input: ReviewAccountDeletionRequestInput
  ): Promise<void> {
    const db =
      getFirestore("default");

    const requestRef =
      db
        .collection(
          "accountDeletionRequests"
        )
        .doc(input.requestId);

    const snapshot =
      await requestRef.get();

    if (!snapshot.exists) {
      throw new AccountDeletionApprovalError(
        "Deletion request not found.",
        "not-found"
      );
    }

    const request =
      snapshot.data();

    /*
     * A request awaiting more information remains reviewable after the
     * account holder responds through support. All other terminal or
     * processing states remain immutable.
     */
    if (
      request?.status !== "pending_review" &&
      request?.status !== "more_information_required"
    ) {
      throw new AccountDeletionApprovalError(
        "Only pending requests may be reviewed.",
        "invalid-status"
      );
    }

    let nextStatus:
      | "approved"
      | "rejected"
      | "more_information_required";

    switch (input.decision) {
      case "approved":
        nextStatus = "approved";
        break;

      case "rejected":
        nextStatus = "rejected";
        break;

      default:
        nextStatus =
          "more_information_required";
    }

    await requestRef.update({
      status: nextStatus,

      adminDecision: {
        adminId: input.adminId,

        decision: input.decision,

        notes:
          input.notes ?? null,

        decidedAt:
          FieldValue.serverTimestamp(),
      },

      scheduledDeletionAt:
        input.decision ===
          "approved"
          ? input.scheduledDeletionAt ??
            null
          : null,

      updatedAt:
        FieldValue.serverTimestamp(),
    });
  },
};

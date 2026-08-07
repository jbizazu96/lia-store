/*
|--------------------------------------------------------------------------
| Admin Account Deletion Callables
|--------------------------------------------------------------------------
|
| The Admin UI sees only protected, review-safe account deletion summaries.
| Approval uses the existing Account Deletion Approval Service; this callable
| never runs the destructive engine itself.
|
*/

import * as admin from "firebase-admin";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import {
  accountDeletionApprovalService,
  AccountDeletionApprovalError,
} from "../accountDeletion/accountDeletionApprovalService";
import {
  ACCOUNT_DELETION_POLICY,
} from "../accountDeletion/accountDeletionPolicy";
import {
  requireActiveAdmin,
} from "../admin/adminAuthorizationService";
import {
  writeAdminAuditLog,
} from "../admin/adminAuditLogService";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");

type Data = Record<string, unknown>;
type DeletionStatus =
  | "pending_review"
  | "more_information_required"
  | "approved"
  | "rejected"
  | "scheduled"
  | "processing"
  | "failed"
  | "completed"
  | "cancelled";

function record(value: unknown): Data {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Data
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function timestamp(value: unknown): string | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();
    return date instanceof Date ? date.toISOString() : null;
  }

  return typeof value === "string" ? value : null;
}

function deletionStatus(value: unknown): DeletionStatus {
  const status = text(value);
  return [
    "pending_review",
    "more_information_required",
    "approved",
    "rejected",
    "scheduled",
    "processing",
    "failed",
    "completed",
    "cancelled",
  ].includes(status)
    ? status as DeletionStatus
    : "pending_review";
}

function requestId(value: unknown): string {
  const id = text(value);
  if (!id || id.includes("/") || id.includes("\\")) {
    throw new HttpsError("invalid-argument", "A valid deletion request is required.");
  }

  return id;
}

function optionalNotes(value: unknown): string | null {
  const notes = text(value);
  if (!notes) return null;
  if (notes.length > 1_000) {
    throw new HttpsError("invalid-argument", "Notes must be 1,000 characters or fewer.");
  }

  return notes;
}

function approvedDeletionDate(value: unknown): Date {
  const selected = text(value);
  const now = new Date();
  const defaultDate = new Date(now);
  defaultDate.setUTCDate(defaultDate.getUTCDate() +
    ACCOUNT_DELETION_POLICY.DEFAULT_GRACE_PERIOD_DAYS);
  defaultDate.setUTCHours(12, 0, 0, 0);

  if (!selected) return defaultDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selected)) {
    throw new HttpsError("invalid-argument", "Select a valid deletion date.");
  }

  const scheduled = new Date(selected + "T12:00:00.000Z");
  if (Number.isNaN(scheduled.getTime())) {
    throw new HttpsError("invalid-argument", "Select a valid deletion date.");
  }

  const earliest = new Date(now);
  earliest.setUTCDate(earliest.getUTCDate() + 1);
  earliest.setUTCHours(0, 0, 0, 0);
  const latest = new Date(now);
  latest.setUTCDate(latest.getUTCDate() +
    ACCOUNT_DELETION_POLICY.MAXIMUM_GRACE_PERIOD_DAYS);
  latest.setUTCHours(23, 59, 59, 999);

  if (scheduled < earliest || scheduled > latest) {
    throw new HttpsError(
      "invalid-argument",
      "Schedule deletion between tomorrow and " +
        String(ACCOUNT_DELETION_POLICY.MAXIMUM_GRACE_PERIOD_DAYS) +
        " days from now."
    );
  }

  return scheduled;
}

async function ownerSummary(ownerType: string, ownerId: string) {
  const user = await db.collection("users").doc(ownerId).get();
  const userData = user.data() ?? {};
  const base = {
    name: [text(userData.firstName), text(userData.lastName)]
      .filter(Boolean)
      .join(" ") || "Account holder",
    email: text(userData.email),
  };

  if (ownerType === "driver") {
    const driver = await db.collection("drivers").doc(ownerId).get();
    const data = driver.data() ?? {};
    return {
      ...base,
      name: [text(data.firstName), text(data.lastName)]
        .filter(Boolean)
        .join(" ") || base.name,
      email: text(data.email) || base.email,
      accountStatus: deletionStatus(data.status),
    };
  }

  if (ownerType === "store") {
    const stores = await db.collection("stores")
      .where("ownerId", "==", ownerId)
      .limit(2)
      .get();
    const store = stores.docs[0];
    const data = store?.data() ?? {};
    return {
      ...base,
      name: text(data.name) || base.name,
      email: text(data.email) || base.email,
      accountStatus: deletionStatus(data.status),
    };
  }

  return {
    ...base,
    accountStatus: "customer",
  };
}

async function notifyOwner(
  ownerId: string,
  input: {
    title: string;
    body: string;
    requestId: string;
  }
): Promise<void> {
  const user = await db.collection("users").doc(ownerId).get();
  if (!user.exists) return;

  await db.collection("users").doc(ownerId)
    .collection("notifications")
    .doc("account-deletion-" + input.requestId)
    .set({
      title: input.title,
      body: input.body,
      type: "system",
      read: false,
      deepLink: "/profile",
      requestId: input.requestId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
}

function deletionListItem(document: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = document.data();
  return {
    id: document.id,
    ownerType: text(data.ownerType) || "customer",
    status: deletionStatus(data.status),
    reasonCode: text(data.reasonCode) || "other",
    requestedAt: timestamp(data.requestedAt),
    scheduledDeletionAt: timestamp(data.scheduledDeletionAt),
  };
}

export const getAdminAccountDeletionRequests = onCall(
  {region: "us-central1"},
  async (request) => {
    await requireActiveAdmin(request);
    const input = record(request.data);
    const selectedStatus = text(input.status) || "pending_review";

    if (![
      "pending_review",
      "more_information_required",
      "approved",
      "rejected",
      "failed",
      "completed",
    ].includes(selectedStatus)) {
      throw new HttpsError("invalid-argument", "A valid deletion request status is required.");
    }

    const snapshot = await db.collection("accountDeletionRequests").limit(100).get();
    const requests = snapshot.docs.map(deletionListItem);

    return {
      requests: requests
        .filter((item) => item.status === selectedStatus)
        .sort((left, right) => (right.requestedAt ?? "")
          .localeCompare(left.requestedAt ?? "")),
      counts: {
        pending_review: requests.filter((item) => item.status === "pending_review").length,
        more_information_required: requests.filter((item) =>
          item.status === "more_information_required").length,
        approved: requests.filter((item) => item.status === "approved").length,
        rejected: requests.filter((item) => item.status === "rejected").length,
        failed: requests.filter((item) => item.status === "failed").length,
      },
    };
  }
);

export const getAdminAccountDeletionRequest = onCall(
  {region: "us-central1"},
  async (request) => {
    await requireActiveAdmin(request);
    const id = requestId(record(request.data).requestId);
    const deletionRequest = await db.collection("accountDeletionRequests").doc(id).get();
    if (!deletionRequest.exists) {
      throw new HttpsError("not-found", "Deletion request not found.");
    }

    const data = deletionRequest.data() ?? {};
    const ownerType = text(data.ownerType);
    const ownerId = text(data.ownerId);
    const decision = record(data.adminDecision);
    const workflow = record(data.workflow);

    return {
      id: deletionRequest.id,
      ownerType,
      owner: await ownerSummary(ownerType, ownerId),
      status: deletionStatus(data.status),
      reasonCode: text(data.reasonCode) || "other",
      reasonDetails: text(data.reasonDetails) || null,
      requestedAt: timestamp(data.requestedAt),
      scheduledDeletionAt: timestamp(data.scheduledDeletionAt),
      engineSupported: ownerType === "driver",
      adminDecision: {
        decision: text(decision.decision) || null,
        notes: text(decision.notes) || null,
        decidedAt: timestamp(decision.decidedAt),
      },
      workflow: {
        currentStep: text(workflow.currentStep) || "not_started",
        attemptCount: typeof workflow.attemptCount === "number"
          ? workflow.attemptCount
          : 0,
        failedStep: text(workflow.failedStep) || null,
        lastError: text(workflow.lastError) || null,
        startedAt: timestamp(workflow.startedAt),
        completedAt: timestamp(workflow.completedAt),
      },
    };
  }
);

export const decideAdminAccountDeletionRequest = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireActiveAdmin(request);
    const input = record(request.data);
    const id = requestId(input.requestId);
    const decision = text(input.decision);
    const notes = optionalNotes(input.notes);

    if (!["approved", "rejected", "more_information_required"].includes(decision)) {
      throw new HttpsError("invalid-argument", "Choose a valid deletion decision.");
    }
    if (decision !== "approved" && !notes) {
      throw new HttpsError("invalid-argument", "Give the account holder a reason or next step.");
    }

    const deletionRequest = await db.collection("accountDeletionRequests").doc(id).get();
    if (!deletionRequest.exists) {
      throw new HttpsError("not-found", "Deletion request not found.");
    }
    const data = deletionRequest.data() ?? {};
    const ownerType = text(data.ownerType);
    const ownerId = text(data.ownerId);

    /*
     * The existing engine only deletes driver accounts. Do not schedule a
     * store/customer request that would later fail in the destructive worker.
     */
    if (decision === "approved" && ownerType !== "driver") {
      throw new HttpsError(
        "failed-precondition",
        "Deletion approval is not available for this account type yet."
      );
    }

    const scheduledDeletionAt = decision === "approved"
      ? approvedDeletionDate(input.scheduledDeletionDate)
      : null;

    try {
      await accountDeletionApprovalService.reviewRequest({
        requestId: id,
        adminId: administrator.uid,
        decision: decision as "approved" | "rejected" | "more_information_required",
        notes,
        scheduledDeletionAt,
      });
    } catch (error) {
      if (error instanceof AccountDeletionApprovalError) {
        throw new HttpsError("failed-precondition", error.message);
      }
      throw error;
    }

    await writeAdminAuditLog(administrator, {
      action: "account_deletion_" + decision,
      targetType: "account_deletion_request",
      targetId: id,
      reason: notes,
      details: {
        ownerType,
        ...(scheduledDeletionAt
          ? {scheduledDeletionAt: scheduledDeletionAt.toISOString()}
          : {}),
      },
    });

    try {
      if (decision === "approved" && scheduledDeletionAt) {
        await notifyOwner(ownerId, {
          title: "Account deletion approved",
          body: "Your deletion request was approved. It is scheduled for " +
            scheduledDeletionAt.toLocaleDateString("en-US") + ".",
          requestId: id,
        });
      } else if (decision === "rejected") {
        await notifyOwner(ownerId, {
          title: "Account deletion request update",
          body: notes || "Your deletion request was not approved.",
          requestId: id,
        });
      } else {
        await notifyOwner(ownerId, {
          title: "More information needed",
          body: notes || "LIA needs more information about your deletion request.",
          requestId: id,
        });
      }
    } catch (error) {
      console.error("Unable to create account-deletion owner notification.", {
        requestId: id,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }

    return {
      success: true,
      scheduledDeletionAt: scheduledDeletionAt?.toISOString() ?? null,
    };
  }
);

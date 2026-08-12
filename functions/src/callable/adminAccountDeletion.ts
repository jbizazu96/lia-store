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
import {restoreAccountDeletionAccess} from "../accountDeletion/accountDeletionAccessService";
import {
  requireAdminPermission,
} from "../admin/adminAuthorizationService";
import {
  writeAdminAuditLog,
} from "../admin/adminAuditLogService";
import {
  notificationService,
} from "../services/notificationService";

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
    deepLink: string;
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
      deepLink: input.deepLink,
      requestId: input.requestId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});

  try {
    await notificationService.sendToUser(
      ownerId,
      input.title,
      input.body,
      input.deepLink,
    );
  } catch (error) {
    console.error("Account deletion push notification failed.", {
      requestId: input.requestId,
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
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
    await requireAdminPermission(request, "deletion_requests");
    const input = record(request.data);
    const selectedStatus = text(input.status) || "pending_review";
    const requestedPageSize = typeof input.pageSize === "number" ? input.pageSize : 50;
    const pageSize = Math.min(100, Math.max(1, Math.floor(requestedPageSize)));
    const cursorId = text(input.cursor);

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

    let query = db.collection("accountDeletionRequests")
      .where("status", "==", selectedStatus)
      .orderBy("requestedAt", "desc")
      .limit(pageSize + 1);
    if (cursorId) {
      const cursor = await db.collection("accountDeletionRequests").doc(requestId(cursorId)).get();
      if (!cursor.exists || cursor.data()?.status !== selectedStatus) {
        throw new HttpsError("invalid-argument", "The deletion request cursor is invalid.");
      }
      query = query.startAfter(cursor);
    }

    const statuses = [
      "pending_review", "more_information_required", "approved", "rejected", "failed",
    ] as const;
    const [snapshot, ...countResults] = await Promise.all([
      query.get(),
      ...statuses.map((status) => db.collection("accountDeletionRequests")
        .where("status", "==", status).count().get()),
    ]);
    const hasMore = snapshot.size > pageSize;
    const pageDocuments = snapshot.docs.slice(0, pageSize);
    const counts = Object.fromEntries(statuses.map((status, index) => [
      status,
      countResults[index].data().count,
    ]));

    return {
      requests: pageDocuments.map(deletionListItem),
      counts,
      nextCursor: hasMore ? pageDocuments.at(-1)?.id ?? null : null,
    };
  }
);

export const getAdminAccountDeletionRequest = onCall(
  {region: "us-central1"},
  async (request) => {
    await requireAdminPermission(request, "deletion_requests");
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
      engineSupported: ["customer", "driver", "store"].includes(ownerType),
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
    const administrator = await requireAdminPermission(request, "deletion_requests", "write");
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

    if (!["customer", "driver", "store"].includes(ownerType)) {
      throw new HttpsError(
        "failed-precondition",
        "Deletion is not available for this account type."
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
      const deepLink = ownerType === "store"
        ? "/store/settings"
        : ownerType === "driver"
          ? "/driver/settings"
          : "/profile";

      if (decision === "approved" && scheduledDeletionAt) {
        await notifyOwner(ownerId, {
          title: "Account deletion approved",
          body: "Your deletion request was approved. It is scheduled for " +
            scheduledDeletionAt.toLocaleDateString("en-US") + ".",
          requestId: id,
          deepLink,
        });
      } else if (decision === "rejected") {
        await notifyOwner(ownerId, {
          title: "Account deletion request update",
          body: notes || "Your deletion request was not approved.",
          requestId: id,
          deepLink,
        });
      } else {
        await notifyOwner(ownerId, {
          title: "More information needed",
          body: notes || "LIA needs more information about your deletion request.",
          requestId: id,
          deepLink,
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

export const retryAdminAccountDeletionRequest = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireAdminPermission(request, "deletion_requests", "write");
    const id = requestId(record(request.data).requestId);
    const reference = db.collection("accountDeletionRequests").doc(id);

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) {
        throw new HttpsError("not-found", "Deletion request not found.");
      }
      if (snapshot.data()?.status !== "failed") {
        throw new HttpsError(
          "failed-precondition",
          "Only a failed deletion request can be retried."
        );
      }

      transaction.update(reference, {
        status: "approved",
        scheduledDeletionAt: FieldValue.serverTimestamp(),
        "workflow.currentStep": "validating_account",
        "workflow.failedAt": null,
        "workflow.failedStep": null,
        "workflow.lastError": null,
        "workflow.retryCount": 0,
        "workflow.nextRetryAt": null,
        "workflow.leaseExpiresAt": null,
        "workflow.leaseToken": null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    await writeAdminAuditLog(administrator, {
      action: "account_deletion_retry_requested",
      targetType: "account_deletion_request",
      targetId: id,
      reason: "Administrator requested a retry.",
    });

    return {success: true};
  }
);

export const reinstateAdminAccountDeletionRequest = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireAdminPermission(request, "deletion_requests", "write");
    const id = requestId(record(request.data).requestId);
    const reference = db.collection("accountDeletionRequests").doc(id);
    let ownerId = "";

    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const data = snapshot.data();
      if (!snapshot.exists || !data) {
        throw new HttpsError("not-found", "Deletion request not found.");
      }
      if (["processing", "completed", "cancelled"].includes(data.status)) {
        throw new HttpsError(
          "failed-precondition",
          "This deletion request can no longer be reinstated."
        );
      }
      ownerId = text(data.ownerId);
      transaction.update(reference, {
        status: "cancelled",
        scheduledDeletionAt: null,
        reinstatedAt: FieldValue.serverTimestamp(),
        reinstatedBy: administrator.uid,
        "workflow.nextRetryAt": null,
        "workflow.leaseExpiresAt": null,
        "workflow.leaseToken": null,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    if (!ownerId) {
      throw new HttpsError("failed-precondition", "The request owner is invalid.");
    }
    await restoreAccountDeletionAccess(ownerId);
    await writeAdminAuditLog(administrator, {
      action: "account_deletion_reinstated",
      targetType: "account_deletion_request",
      targetId: id,
      reason: "Administrator reinstated account access.",
    });
    return {success: true};
  }
);

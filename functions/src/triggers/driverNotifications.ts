import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {onDocumentUpdated, onDocumentWritten} from "firebase-functions/v2/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {enqueueEmail, type EmailCategory} from "../email/emailQueueService";
import {driverAccountActivityEmail} from "../email/emailTemplates";
import {notificationService} from "../services/notificationService";

type Data = Record<string, unknown>;
type Notice = {title: string; body: string; deepLink: string; type: "system" | "payment"};

const db = getFirestore("default");
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const record = (value: unknown): Data => value && typeof value === "object" && !Array.isArray(value) ? value as Data : {};
const money = (value: unknown): string => new Intl.NumberFormat("en-US", {style: "currency", currency: "USD"}).format((typeof value === "number" && Number.isFinite(value) ? value : 0) / 100);

async function driverIdentity(driverId: string): Promise<{name: string; email: string}> {
  const [driver, user] = await Promise.all([
    db.collection("drivers").doc(driverId).get(),
    db.collection("users").doc(driverId).get(),
  ]);
  const data = driver.data() ?? {};
  return {
    name: [text(data.firstName), text(data.lastName)].filter(Boolean).join(" ") || text(user.data()?.displayName) || "Driver",
    email: text(data.email) || text(user.data()?.email),
  };
}

async function queueDriverEmail(input: {
  driverId: string;
  eventKey: string;
  notice: Notice;
  category: EmailCategory;
  badge: string;
}) {
  const identity = await driverIdentity(input.driverId);
  const template = driverAccountActivityEmail({
    driverName: identity.name,
    title: input.notice.title,
    summary: input.notice.body,
    badge: input.badge,
    actionLabel: input.notice.type === "payment" ? "View payout account" : "Open driver account",
    url: `https://www.liamarketplace.com${input.notice.deepLink}`,
  });
  await enqueueEmail({
    dedupeKey: `driver-${input.eventKey}`,
    category: input.category,
    to: identity.email,
    ...template,
    tags: {driver_id: input.driverId},
  });
}

async function notifyDriver(input: {driverId: string; eventKey: string; notice: Notice; emailCategory?: EmailCategory; emailBadge?: string}) {
  const notification = db.collection("users").doc(input.driverId).collection("notifications").doc(`driver-${input.eventKey}`);
  try {
    await notification.create({
      uid: input.driverId,
      title: input.notice.title,
      body: input.notice.body,
      type: input.notice.type,
      deepLink: input.notice.deepLink,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    const code = (error as {code?: unknown}).code;
    if (code === 6 || code === "already-exists") return;
    throw error;
  }

  try {
    await notificationService.sendToUser(
      input.driverId,
      input.notice.title,
      input.notice.body,
      input.notice.deepLink,
      input.notice.type === "payment" ? "paymentUpdates" : undefined,
    );
  } catch (error) {
    console.error("Driver push notification failed.", {driverId: input.driverId, eventKey: input.eventKey, error});
  }

  if (input.emailCategory) {
    await queueDriverEmail({
      driverId: input.driverId,
      eventKey: input.eventKey,
      notice: input.notice,
      category: input.emailCategory,
      badge: input.emailBadge ?? "DRIVER UPDATE",
    });
  }
}

function documentData(value: unknown): {status: string; reason: string; expirationDate: string} {
  const data = record(value);
  return {status: text(data.reviewStatus), reason: text(data.rejectionReason), expirationDate: text(data.expirationDate)};
}

const driverDocuments = [
  {field: "driversLicense", label: "Driver license"},
  {field: "vehicleInsurance", label: "Vehicle insurance"},
  {field: "vehicleRegistration", label: "Vehicle registration"},
] as const;

export const driverAccountNotifications = onDocumentUpdated(
  {document: "drivers/{driverId}", region: "us-central1", database: "default"},
  async (event) => {
    const before = event.data?.before.data() as Data | undefined;
    const after = event.data?.after.data() as Data | undefined;
    if (!before || !after) return;
    const driverId = event.params.driverId;
    const tasks: Array<Promise<unknown>> = [];
    const previousStatus = text(before.status);
    const nextStatus = text(after.status);

    if (previousStatus !== nextStatus) {
      const stateNotice: Record<string, Notice | undefined> = {
        approved: {title: "Driver application approved", body: "Your LIA driver application is approved. Your Shipday access is being prepared.", deepLink: "/driver/dashboard", type: "system"},
        rejected: {title: "Driver application needs corrections", body: text(record(after.applicationReview).reason) || "Review your application, correct the requested information, and resubmit it.", deepLink: "/driver/pending-approval", type: "system"},
        suspended: {title: "Driver access suspended", body: text(record(after.suspension).reason) || "Your LIA driver access has been suspended. Contact LIA Support for assistance.", deepLink: "/driver/pending-approval", type: "system"},
      };
      if (previousStatus === "suspended" && (nextStatus === "approved" || nextStatus === "pending_review")) {
        tasks.push(notifyDriver({driverId, eventKey: `reinstated-${event.id}`, notice: {title: "Driver suspension removed", body: nextStatus === "approved" ? "Your LIA driver access has been restored." : "Your suspension was removed. Your application is awaiting administrator approval before workspace access is restored.", deepLink: nextStatus === "approved" ? "/driver/dashboard" : "/driver/pending-approval", type: "system"}, emailCategory: "driver_account_status", emailBadge: "ACCOUNT REINSTATED"}));
      } else {
        const notice = stateNotice[nextStatus];
        if (notice) tasks.push(notifyDriver({driverId, eventKey: `status-${nextStatus}-${event.id}`, notice, ...(["approved", "rejected"].includes(nextStatus) ? {emailCategory: "driver_account_status" as const, emailBadge: nextStatus === "approved" ? "APPLICATION APPROVED" : "APPLICATION DECISION"} : {})}));
      }
    }

    for (const item of driverDocuments) {
      const previous = documentData(before[item.field]);
      const current = documentData(after[item.field]);
      if (previous.status !== "rejected" && current.status === "rejected") {
        const reason = current.reason ? ` Reason: ${current.reason}` : "";
        tasks.push(notifyDriver({driverId, eventKey: `document-${item.field}-rejected-${event.id}`, notice: {title: `${item.label} needs correction`, body: `LIA rejected this document.${reason}`, deepLink: "/driver/settings", type: "system"}, emailCategory: "driver_document", emailBadge: "DOCUMENT REJECTED"}));
      }
    }

    const previousStripe = text(before.stripeAccountStatus);
    const currentStripe = text(after.stripeAccountStatus);
    const previouslyReady = before.stripeTransfersEnabled === true && before.stripePayoutsEnabled === true && before.stripeRequiresAction !== true;
    const currentlyReady = after.stripeTransfersEnabled === true && after.stripePayoutsEnabled === true && after.stripeRequiresAction !== true;
    if (!previouslyReady && currentlyReady) {
      tasks.push(notifyDriver({driverId, eventKey: `stripe-ready-${event.id}`, notice: {title: "Payout account ready", body: "Your Stripe account is ready to receive LIA driver payments.", deepLink: "/driver/settings", type: "payment"}}));
    } else if ((previousStripe !== currentStripe || previouslyReady !== currentlyReady) && !currentlyReady && ["action_required", "restricted"].includes(currentStripe)) {
      tasks.push(notifyDriver({driverId, eventKey: `stripe-attention-${event.id}`, notice: {title: "Payout account needs attention", body: "Open Driver Settings and complete Stripe's required payout steps.", deepLink: "/driver/settings", type: "payment"}, emailCategory: "driver_stripe", emailBadge: "PAYOUT ACTION REQUIRED"}));
    }
    await Promise.all(tasks);
  },
);

export const driverPaymentNotifications = onDocumentWritten(
  {document: "paymentTransfers/{transferId}", region: "us-central1", database: "default"},
  async (event) => {
    const before = event.data?.before.exists ? event.data.before.data() as Data : undefined;
    const after = event.data?.after.exists ? event.data.after.data() as Data : undefined;
    if (!after) return;
    const recipient = record(after.recipient);
    if (text(recipient.type) !== "driver") return;
    const driverId = text(recipient.id);
    const nextStatus = text(after.status);
    const previousStatus = text(before?.status);
    if (!driverId || previousStatus === nextStatus) return;
    const amount = money(after.amount);
    const notices: Record<string, Notice | undefined> = {
      pending: {title: "Driver earnings pending", body: `${amount} from a completed delivery is pending payout.`, deepLink: "/driver/payments", type: "payment"},
      completed: {title: "Driver payment sent", body: `${amount} was sent to your Stripe payout account.`, deepLink: "/driver/payments", type: "payment"},
      failed: {title: "Driver payment needs attention", body: `${amount} could not be sent. LIA will review the payment; do not change delivery records in Shipday.`, deepLink: "/driver/payments", type: "payment"},
    };
    const notice = notices[nextStatus];
    if (!notice) return;
    await notifyDriver({driverId, eventKey: `payment-${event.params.transferId}-${nextStatus}`, notice, emailCategory: "driver_payout", emailBadge: "DRIVER PAYOUT"});
  },
);

export const driverRefundReversalNotifications = onDocumentWritten(
  {document: "paymentRefunds/{refundId}", region: "us-central1", database: "default"},
  async (event) => {
    const before = event.data?.before.exists ? event.data.before.data() as Data : {};
    const after = event.data?.after.exists ? event.data.after.data() as Data : undefined;
    if (!after) return;
    const previous = new Map((Array.isArray(before.reversals) ? before.reversals : []).map((value) => {
      const reversal = record(value); return [`${text(reversal.recipientType)}:${text(reversal.recipientId)}`, text(reversal.status)];
    }));
    const reversals = Array.isArray(after.reversals) ? after.reversals : [];
    await Promise.all(reversals.map(async (value) => {
      const reversal = record(value);
      if (text(reversal.recipientType) !== "driver") return;
      const driverId = text(reversal.recipientId);
      const status = text(reversal.status);
      if (!driverId || previous.get(`driver:${driverId}`) === status || !["pending", "completed", "failed"].includes(status)) return;
      const amount = money(reversal.amount);
      const notice: Notice = status === "completed"
        ? {title: "Driver earnings adjustment completed", body: `${amount} was recovered from a previous payout because of an approved customer refund.`, deepLink: "/driver/payments", type: "payment"}
        : status === "failed"
          ? {title: "Driver earnings adjustment needs review", body: `A ${amount} refund-related adjustment could not be completed. LIA Support will review it.`, deepLink: "/driver/payments", type: "payment"}
          : {title: "Driver earnings adjustment pending", body: `${amount} from a previous delivery is being adjusted because of an approved customer refund.`, deepLink: "/driver/payments", type: "payment"};
      await notifyDriver({driverId, eventKey: `refund-${event.params.refundId}-${status}`, notice, emailCategory: "driver_refund_reversal", emailBadge: "EARNINGS ADJUSTMENT"});
    }));
  },
);

export const driverAccountDeletionNotifications = onDocumentUpdated(
  {document: "accountDeletionRequests/{requestId}", region: "us-central1", database: "default"},
  async (event) => {
    const before = event.data?.before.data() as Data | undefined;
    const after = event.data?.after.data() as Data | undefined;
    if (!before || !after || text(after.ownerType) !== "driver" || text(before.status) === text(after.status)) return;
    const status = text(after.status);
    const driverId = text(after.ownerId);
    const decision = record(after.adminDecision);
    const notes = text(decision.notes);
    const notices: Record<string, Notice | undefined> = {
      approved: {title: "Account deletion approved", body: notes || "LIA approved your deletion request. Permanent deletion will follow the stated review period.", deepLink: "/driver/settings", type: "system"},
      rejected: {title: "Account deletion request declined", body: notes || "LIA declined your deletion request and restored access to your driver account.", deepLink: "/driver/settings", type: "system"},
      more_information_required: {title: "More information required", body: notes || "LIA needs more information before deciding your account-deletion request.", deepLink: "/driver/settings", type: "system"},
      cancelled: {title: "Account deletion cancelled", body: "Your account-deletion request was cancelled and your driver account remains available.", deepLink: "/driver/settings", type: "system"},
    };
    const notice = notices[status];
    if (!driverId || !notice) return;
    await notifyDriver({driverId, eventKey: `deletion-${event.params.requestId}-${status}`, notice, emailCategory: "driver_account_deletion", emailBadge: "ACCOUNT DELETION"});
  },
);

function daysUntil(date: string, now: Date): number | null {
  const expires = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(expires.getTime())) return null;
  return Math.ceil((expires.getTime() - now.getTime()) / 86_400_000);
}

export const remindExpiringDriverDocuments = onSchedule(
  {schedule: "every day 14:00", timeZone: "UTC", region: "us-central1"},
  async () => {
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    const today = new Date();
    do {
      let query = db.collection("drivers").where("isApproved", "==", true).orderBy("__name__").limit(250);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      for (const driver of page.docs) {
        const data = driver.data();
        for (const item of driverDocuments) {
          const document = documentData(data[item.field]);
          const days = daysUntil(document.expirationDate, today);
          if (days === null || days < 0) continue;
          const notice: Notice = {title: `${item.label} ${days === 0 ? "expires today" : "expires soon"}`, body: days === 0 ? `Your ${item.label.toLowerCase()} expires today. Upload a replacement in Driver Settings.` : `Your ${item.label.toLowerCase()} expires in ${days} day${days === 1 ? "" : "s"}. Upload a replacement before it expires.`, deepLink: "/driver/settings", type: "system"};
          if ([30, 14, 7, 1, 0].includes(days)) {
            await notifyDriver({driverId: driver.id, eventKey: `document-${item.field}-expires-${document.expirationDate}-${days}`, notice});
          }
          if (days <= 7) {
            await queueDriverEmail({driverId: driver.id, eventKey: `document-email-${item.field}-expires-${document.expirationDate}-${days}`, notice, category: "driver_document", badge: "DOCUMENT EXPIRATION"});
          }
        }
      }
      cursor = page.docs.at(-1) ?? null;
      if (page.size < 250) cursor = null;
    } while (cursor);
  },
);

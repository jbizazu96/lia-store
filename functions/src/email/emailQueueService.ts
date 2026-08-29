import * as admin from "firebase-admin";
import {createHash} from "crypto";
import {FieldValue, getFirestore} from "firebase-admin/firestore";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");

export type EmailCategory =
  | "auth_email_verification"
  | "auth_password_reset"
  | "customer_order_delivered"
  | "customer_refund_claim"
  | "store_new_order"
  | "store_scheduled_preparation"
  | "store_refund_claim"
  | "store_inventory_digest"
  | "driver_shipday_credentials"
  | "driver_payout"
  | "driver_refund_reversal"
  | "driver_support"
  | "driver_account_deletion"
  | "driver_account_status"
  | "driver_document"
  | "driver_stripe"
  | "admin_support"
  | "admin_refund"
  | "admin_order_zone";

export interface EmailJobInput {
  dedupeKey: string;
  category: EmailCategory;
  to: string;
  subject: string;
  html: string;
  text: string;
  tags?: Record<string, string>;
}

function safeJobId(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function enqueueEmail(input: EmailJobInput): Promise<boolean> {
  if (!validEmail(input.to)) {
    console.warn("Email job skipped because the recipient is invalid.", {
      category: input.category,
      dedupeKey: input.dedupeKey,
    });
    return false;
  }
  const normalizedEmail = input.to.trim().toLowerCase();
  if ((await db.collection("emailSuppressions").doc(normalizedEmail).get()).exists) {
    console.warn("Email job skipped because the recipient is suppressed.", {
      category: input.category,
      dedupeKey: input.dedupeKey,
    });
    return false;
  }
  const reference = db.collection("emailJobs").doc(safeJobId(input.dedupeKey));
  try {
    await reference.create({
      category: input.category,
      dedupeKey: input.dedupeKey,
      to: normalizedEmail,
      subject: input.subject.slice(0, 300),
      html: input.html,
      text: input.text,
      tags: input.tags ?? {},
      status: "pending",
      attempts: 0,
      nextAttemptAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (error) {
    const code = (error as {code?: unknown}).code;
    if (code === 6 || code === "already-exists") {
      console.info("Duplicate email job safely skipped.", {
        category: input.category,
        dedupeKey: input.dedupeKey,
      });
      return false;
    }
    throw error;
  }
}

export async function enqueueAdminEmail(input: Omit<EmailJobInput, "to" | "dedupeKey"> & {dedupeKey: string}): Promise<number> {
  const admins = await db.collection("admins").where("isActive", "==", true).get();
  const results = await Promise.all(admins.docs.map((adminDocument) => {
    const email = typeof adminDocument.data().email === "string" ? adminDocument.data().email : "";
    return enqueueEmail({...input, to: email, dedupeKey: `${input.dedupeKey}:${adminDocument.id}`});
  }));
  const queuedCount = results.filter(Boolean).length;
  console.info("Admin email fan-out completed.", {
    category: input.category,
    activeAdminCount: admins.size,
    queuedCount,
    skippedCount: admins.size - queuedCount,
  });
  return queuedCount;
}

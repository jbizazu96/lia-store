import * as admin from "firebase-admin";
import {createHmac, timingSafeEqual} from "crypto";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import {onRequest} from "firebase-functions/v2/https";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");
const webhookSecret = defineSecret("RESEND_WEBHOOK_SECRET");

function verify(body: Buffer, id: string, timestamp: string, signatureHeader: string): boolean {
  const age = Math.abs(Date.now() / 1_000 - Number(timestamp));
  if (!id || !timestamp || !Number.isFinite(age) || age > 300) return false;
  const encodedSecret = webhookSecret.value().replace(/^whsec_/, "");
  let key: Buffer;
  try { key = Buffer.from(encodedSecret, "base64"); } catch { return false; }
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body.toString("utf8")}`).digest("base64");
  return signatureHeader.split(" ").some((part) => {
    const candidate = part.startsWith("v1,") ? part.slice(3) : "";
    if (!candidate) return false;
    const left = Buffer.from(candidate); const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  });
}

export const resendEmailWebhook = onRequest({region: "us-central1", secrets: [webhookSecret]}, async (request, response) => {
  if (request.method !== "POST") { response.status(405).send("Method not allowed"); return; }
  const rawBody = request.rawBody;
  if (!verify(rawBody, String(request.header("svix-id") ?? ""), String(request.header("svix-timestamp") ?? ""), String(request.header("svix-signature") ?? ""))) {
    response.status(401).send("Invalid signature"); return;
  }
  const event = request.body as {type?: unknown; data?: {email_id?: unknown; to?: unknown}};
  const type = typeof event.type === "string" ? event.type : "";
  const emailId = typeof event.data?.email_id === "string" ? event.data.email_id : "";
  if (!emailId) { response.status(202).send("Ignored"); return; }
  const jobs = await db.collection("emailJobs").where("resendEmailId", "==", emailId).limit(1).get();
  if (!jobs.empty) {
    const field = ({"email.delivered": "deliveredAt", "email.bounced": "bouncedAt", "email.complained": "complainedAt", "email.failed": "providerFailedAt", "email.delivery_delayed": "delayedAt"} as Record<string, string>)[type];
    if (field) await jobs.docs[0].ref.update({providerStatus: type.replace("email.", ""), [field]: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
  }
  if (["email.bounced", "email.complained"].includes(type)) {
    const recipientValue = event.data?.to;
    const recipients: unknown[] = Array.isArray(recipientValue) ? recipientValue : [];
    await Promise.all(recipients.filter((value): value is string => typeof value === "string").map((email) => db.collection("emailSuppressions").doc(email.trim().toLowerCase()).set({email: email.trim().toLowerCase(), reason: type.replace("email.", ""), updatedAt: FieldValue.serverTimestamp()}, {merge: true})));
  }
  response.status(200).send("OK");
});

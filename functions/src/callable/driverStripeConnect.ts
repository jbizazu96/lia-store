/*
|--------------------------------------------------------------------------
| Driver Stripe Connect Callables
|--------------------------------------------------------------------------
|
| Driver payout setup belongs in Firebase Functions, not a Vercel route.
| These callables verify the signed-in driver, keep Stripe secrets in Secret
| Manager, and persist only LIA's safe operational Stripe summary.
|
*/

import * as admin from "firebase-admin";
import Stripe from "stripe";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { mapStripeAccount } from "../stripe/stripeConnectMapper";
import { stripeConnectPersistence } from "../stripe/stripeConnectPersistence";

if (admin.apps.length === 0) admin.initializeApp();

const db = getFirestore("default");
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const applicationUrl = defineString("APP_URL");
const accountIncludes = ["configuration.recipient", "identity", "requirements", "future_requirements"] as const;

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function accountSummary(account: Stripe.V2.Core.Account, driverId: string) {
  const mapped = mapStripeAccount(account, "driver", driverId);
  return { ownerType: mapped.ownerType, ownerId: mapped.ownerId, accountId: mapped.accountId, onboardingStatus: mapped.onboardingStatus, chargesEnabled: mapped.chargesEnabled, transfersEnabled: mapped.transfersEnabled, payoutsEnabled: mapped.payoutsEnabled, detailsSubmitted: mapped.detailsSubmitted, requiresAction: mapped.onboardingStatus === "action_required" || mapped.onboardingStatus === "restricted", isReady: mapped.onboardingStatus === "complete" };
}
function stripeClient() { return new Stripe(stripeSecretKey.value()); }
function origin() {
  const value = applicationUrl.value().trim().replace(/\/+$/, "");
  try { if (!value || new URL(value).origin !== value) throw new Error(); return value; }
  catch { throw new HttpsError("failed-precondition", "APP_URL must be a valid absolute origin, such as https://app.example.com."); }
}
async function requireDriver(uid: string) {
  const [user, driver] = await Promise.all([db.collection("users").doc(uid).get(), db.collection("drivers").doc(uid).get()]);
  if (user.data()?.accountType !== "driver" || !driver.exists || driver.data()?.ownerUid !== uid) throw new HttpsError("permission-denied", "Only the owning driver can manage this payout account.");
  return driver;
}
function handle(error: unknown, fallback: string): never {
  if (error instanceof HttpsError) throw error;
  if (error instanceof Stripe.errors.StripeError) {
    console.error("Driver Stripe Connect callable failed:", { type: error.type, code: error.code, requestId: error.requestId });
    throw new HttpsError("unavailable", fallback);
  }
  console.error("Unexpected Driver Stripe Connect callable error:", error);
  throw new HttpsError("internal", fallback);
}
async function persistNewDriverAccount(driver: FirebaseFirestore.DocumentSnapshot, account: Stripe.V2.Core.Account) {
  const mapped = mapStripeAccount(account, "driver", driver.id);
  await driver.ref.update({ stripeAccountId: account.id, stripeConnectApiVersion: "v2", stripeConnectedAt: Timestamp.now(), updatedAt: FieldValue.serverTimestamp() });
  await stripeConnectPersistence.saveDriverStripeStatus(mapped);
}

export const createOrRetrieveDriverStripeAccount = onCall({ region: "us-central1", secrets: [stripeSecretKey] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in before managing Stripe.");
  try {
    const driver = await requireDriver(request.auth.uid); const data = driver.data() ?? {}; const accountId = text(data.stripeAccountId);
    if (accountId && text(data.stripeConnectApiVersion) !== "v2") throw new HttpsError("failed-precondition", "This driver has a legacy Stripe connection. Contact LIA support to reconnect it.");
    const stripe = stripeClient();
    const account = accountId ? await stripe.v2.core.accounts.retrieve(accountId, { include: [...accountIncludes] }) : await stripe.v2.core.accounts.create({ contact_email: text(data.email), ...(text(data.phone) ? { contact_phone: text(data.phone) } : {}), display_name: [text(data.firstName), text(data.middleName), text(data.lastName)].filter(Boolean).join(" ") || "LIA Driver", dashboard: "express", identity: { country: "US", entity_type: "individual" }, configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } }, defaults: { responsibilities: { fees_collector: "application", losses_collector: "application" }, profile: { doing_business_as: [text(data.firstName), text(data.lastName)].filter(Boolean).join(" ") || "LIA Driver", product_description: "Independent delivery driver receiving payouts through LIA." } }, metadata: { liaConnectApiVersion: "v2", liaOwnerType: "driver", liaDriverId: driver.id, liaOwnerId: driver.id }, include: [...accountIncludes] }, { idempotencyKey: `driver-connect-account-v2-${driver.id}` });
    if (accountId) await stripeConnectPersistence.saveDriverStripeStatus(mapStripeAccount(account, "driver", driver.id)); else await persistNewDriverAccount(driver, account);
    return { account: accountSummary(account, driver.id), created: !accountId };
  } catch (error) { return handle(error, "Stripe could not process the driver payout request."); }
});

export const getDriverStripeAccountStatus = onCall({ region: "us-central1", secrets: [stripeSecretKey] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in before managing Stripe.");
  try {
    const driver = await requireDriver(request.auth.uid); const accountId = text(driver.data()?.stripeAccountId);
    if (!accountId) return { account: null, connected: false };
    if (text(driver.data()?.stripeConnectApiVersion) !== "v2") throw new HttpsError("failed-precondition", "This driver has a legacy Stripe connection. Contact LIA support to reconnect it.");
    const account = await stripeClient().v2.core.accounts.retrieve(accountId, { include: [...accountIncludes] }); await stripeConnectPersistence.saveDriverStripeStatus(mapStripeAccount(account, "driver", driver.id));
    return { account: accountSummary(account, driver.id), connected: true };
  } catch (error) { return handle(error, "Stripe could not retrieve the driver payout status."); }
});

export const createDriverStripeOnboardingLink = onCall({ region: "us-central1", secrets: [stripeSecretKey] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in before managing Stripe.");
  try {
    const driver = await requireDriver(request.auth.uid); const accountId = text(driver.data()?.stripeAccountId);
    if (!accountId) throw new HttpsError("failed-precondition", "Create the driver payout account before starting Stripe onboarding.");
    if (text(driver.data()?.stripeConnectApiVersion) !== "v2") throw new HttpsError("failed-precondition", "This driver has a legacy Stripe connection. Contact LIA support to reconnect it.");
    const base = origin(); const link = await stripeClient().v2.core.accountLinks.create({ account: accountId, use_case: { type: "account_onboarding", account_onboarding: { configurations: ["recipient"], refresh_url: `${base}/driver/onboarding/stripe?stripe=refresh`, return_url: `${base}/driver/onboarding/stripe?stripe=return`, collection_options: { fields: "eventually_due" } } } });
    return { onboarding: { accountId, url: link.url, expiresAt: Math.floor(new Date(link.expires_at).getTime() / 1000) } };
  } catch (error) { return handle(error, "Stripe could not create the driver onboarding link."); }
});

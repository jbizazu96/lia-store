/*
|--------------------------------------------------------------------------
| Store Stripe Connect Callables
|--------------------------------------------------------------------------
|
| Store Stripe operations run in Firebase Cloud Functions, never in Vercel.
| The callable verifies Firebase Authentication and store ownership before
| it creates, retrieves, or synchronizes a Stripe connected account.
|
*/

import * as admin from "firebase-admin";
import Stripe from "stripe";
import {
  getFirestore,
} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import {
  defineSecret,
  defineString,
} from "firebase-functions/params";
import {
  mapStripeAccount,
} from "../stripe/stripeConnectMapper";
import {
  stripeConnectPersistence,
} from "../stripe/stripeConnectPersistence";
import {enforceCallableAbuseProtection} from "../security/callableAbuseProtection";
import {requireStripeAccess} from "../services/store/storeAccessService";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const storeMerchantAgreementVersion = "lia-merchant-agreement-v1";

/*
 * This trusted application origin is used only for Stripe return URLs.
 * Configure APP_URL in Firebase Functions for production, for example:
 * https://your-vercel-domain.vercel.app
 */
const applicationUrl = defineString("APP_URL");

const accountIncludes = [
  "configuration.recipient",
  "identity",
  "requirements",
  "future_requirements",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requireCurrentMerchantAgreement(data: Record<string, unknown>) {
  const acceptance = isRecord(data.merchantAgreementAcceptance)
    ? data.merchantAgreementAcceptance
    : {};
  if (
    acceptance.accepted !== true ||
    text(acceptance.version) !== storeMerchantAgreementVersion
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Accept the current LIA Merchant Agreement before setting up Stripe payouts.",
    );
  }
}

function requireStoreId(data: unknown): string {
  const storeId = isRecord(data) ? text(data.storeId) : "";
  if (!storeId || storeId.includes("/")) {
    throw new HttpsError("invalid-argument", "A valid store ID is required.");
  }
  return storeId;
}

function trustedApplicationUrl(): string {
  const value = applicationUrl.value().trim().replace(/\/+$/, "");
  if (!value) {
    throw new HttpsError("failed-precondition", "APP_URL must be configured for Stripe onboarding.");
  }
  try {
    const origin = new URL(value).origin;
    if (origin !== value) throw new Error("APP_URL must not include a path.");
    return origin;
  } catch {
    throw new HttpsError("failed-precondition", "APP_URL must be a valid absolute URL for Stripe onboarding.");
  }
}

async function requireOwnedStore(uid: string, storeId: string) {
  const [user, store] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("stores").doc(storeId).get(),
  ]);
  if (user.data()?.accountType !== "store_owner") {
    throw new HttpsError("permission-denied", "Only store owners can manage Stripe payouts.");
  }
  if (["deletion_pending", "deletion_processing"].includes(user.data()?.accountDeletionState)) {
    throw new HttpsError("failed-precondition", "Payout onboarding is unavailable while account deletion is pending.");
  }
  if (!store.exists || store.data()?.ownerId !== uid) {
    throw new HttpsError("permission-denied", "You can manage Stripe only for your own store.");
  }
  return store;
}

function accountSummary(account: Stripe.V2.Core.Account, storeId: string) {
  const mapped = mapStripeAccount(account, "store", storeId);
  return {
    ownerType: mapped.ownerType,
    ownerId: mapped.ownerId,
    accountId: mapped.accountId,
    onboardingStatus: mapped.onboardingStatus,
    chargesEnabled: mapped.chargesEnabled,
    transfersEnabled: mapped.transfersEnabled,
    payoutsEnabled: mapped.payoutsEnabled,
    detailsSubmitted: mapped.detailsSubmitted,
    requiresAction: mapped.onboardingStatus === "action_required" || mapped.onboardingStatus === "restricted",
    isReady: mapped.onboardingStatus === "complete",
  };
}

function entityType(data: Record<string, unknown>): "company" | "individual" | "non_profit" {
  const structure = text(data.businessStructure);
  if (structure === "llc" || structure === "corporation" || structure === "partnership") return "company";
  if (structure === "sole_proprietorship" || structure === "dba") return "individual";
  if (text(data.stripeAccountType) === "non_profit") return "non_profit";
  throw new HttpsError("failed-precondition", "Select a valid business structure before connecting Stripe.");
}

function country(data: Record<string, unknown>): string {
  const value = text(data.country) || "US";
  if (!/^[A-Z]{2}$/.test(value)) {
    throw new HttpsError("failed-precondition", "The store country must be a two-letter ISO country code.");
  }
  return value;
}

function stripeClient(): Stripe {
  return new Stripe(stripeSecretKey.value());
}

async function retrieveAccount(stripe: Stripe, accountId: string) {
  return stripe.v2.core.accounts.retrieve(accountId, {
    include: [...accountIncludes],
  });
}

async function createAccount(stripe: Stripe, storeId: string, ownerId: string, data: Record<string, unknown>) {
  const storeName = text(data.name);
  const email = text(data.email);
  if (!storeName || !email) {
    throw new HttpsError("failed-precondition", "Save your store name and email before connecting Stripe.");
  }
  return stripe.v2.core.accounts.create({
    contact_email: email,
    ...(text(data.phone) ? { contact_phone: text(data.phone) } : {}),
    display_name: storeName,
    dashboard: "express",
    identity: { country: country(data), entity_type: entityType(data) },
    configuration: {
      recipient: {
        capabilities: {
          stripe_balance: {
            stripe_transfers: { requested: true },
          },
        },
      },
    },
    defaults: {
      responsibilities: { fees_collector: "application", losses_collector: "application" },
      profile: {
        doing_business_as: storeName,
        product_description: `${storeName} sells grocery and retail products through LIA Store.`,
      },
    },
    metadata: {
      liaConnectApiVersion: "v2",
      liaOwnerType: "store",
      liaStoreId: storeId,
      liaOwnerId: ownerId,
    },
    include: [...accountIncludes],
  }, { idempotencyKey: `store-connect-account-v2-${storeId}` });
}

function stripeError(error: unknown, fallback: string): never {
  if (error instanceof HttpsError) throw error;
  if (error instanceof Stripe.errors.StripeError) {
    console.error("Store Stripe Connect callable failed:", {
      type: error.type,
      code: error.code,
      message: error.message,
      requestId: error.requestId,
    });
    throw new HttpsError("unavailable", fallback);
  }
  console.error("Unexpected Store Stripe Connect callable error:", error);
  throw new HttpsError("internal", fallback);
}

export const createOrRetrieveStoreStripeAccount = onCall({
  region: "us-central1",
  secrets: [stripeSecretKey],
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in before managing Stripe.");
  await enforceCallableAbuseProtection({operation: "store-stripe-account", uid: request.auth.uid, appCheckVerified: Boolean(request.app), maximumRequests: 5, windowSeconds: 3_600});
  try {
    const storeId = requireStoreId(request.data);
    const store = await requireOwnedStore(request.auth.uid, storeId);
    const data = store.data() ?? {};
    requireStripeAccess(store, data.onboardingCompleted === true ? "settings" : "onboarding");
    if (data.onboardingCompleted !== true) requireCurrentMerchantAgreement(data);
    const existingAccountId = text(data.stripeAccountId);
    if (existingAccountId && text(data.stripeConnectApiVersion) !== "v2") {
      throw new HttpsError("failed-precondition", "This store has a legacy Stripe connection. Reconnect Stripe to use the current payment setup.");
    }
    const stripe = stripeClient();
    const account = existingAccountId
      ? await retrieveAccount(stripe, existingAccountId)
      : await createAccount(stripe, store.id, request.auth.uid, data);
    await stripeConnectPersistence.saveStoreStripeStatus(
      mapStripeAccount(account, "store", store.id),
    );
    return { account: accountSummary(account, store.id), created: !existingAccountId };
  } catch (error) {
    return stripeError(error, "Stripe could not process the connected-account request.");
  }
});

export const getStoreStripeAccountStatus = onCall({
  region: "us-central1",
  secrets: [stripeSecretKey],
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in before managing Stripe.");
  await enforceCallableAbuseProtection({operation: "store-stripe-status", uid: request.auth.uid, appCheckVerified: Boolean(request.app), maximumRequests: 30, windowSeconds: 600});
  try {
    const storeId = requireStoreId(request.data);
    const store = await requireOwnedStore(request.auth.uid, storeId);
    const data = store.data() ?? {};
    requireStripeAccess(store, data.onboardingCompleted === true ? "settings" : "onboarding");
    const accountId = text(data.stripeAccountId);
    if (!accountId) return { account: null, connected: false };
    if (text(data.stripeConnectApiVersion) !== "v2") {
      throw new HttpsError("failed-precondition", "This store has a legacy Stripe connection. Reconnect Stripe to use the current payment setup.");
    }
    const account = await retrieveAccount(stripeClient(), accountId);
    await stripeConnectPersistence.saveStoreStripeStatus(mapStripeAccount(account, "store", store.id));
    return { account: accountSummary(account, store.id), connected: true };
  } catch (error) {
    return stripeError(error, "Stripe could not retrieve the connected-account status.");
  }
});

export const createStoreStripeOnboardingLink = onCall({
  region: "us-central1",
  secrets: [stripeSecretKey],
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in before managing Stripe.");
  await enforceCallableAbuseProtection({operation: "store-stripe-onboarding-link", uid: request.auth.uid, appCheckVerified: Boolean(request.app), maximumRequests: 10, windowSeconds: 600});
  try {
    const storeId = requireStoreId(request.data);
    const returnContext = isRecord(request.data) && request.data.returnContext === "onboarding" ? "onboarding" : "settings";
    const store = await requireOwnedStore(request.auth.uid, storeId);
    const data = store.data() ?? {};
    requireStripeAccess(store, returnContext);
    if (returnContext === "onboarding") requireCurrentMerchantAgreement(data);
    const accountId = text(data.stripeAccountId);
    if (!accountId) throw new HttpsError("failed-precondition", "Create the store's Stripe account before starting onboarding.");
    if (text(data.stripeConnectApiVersion) !== "v2") throw new HttpsError("failed-precondition", "This store has a legacy Stripe connection. Reconnect Stripe to use the current payment setup.");
    const origin = trustedApplicationUrl();
    const path = returnContext === "onboarding" ? "/store/onboarding/stripe" : "/store/settings";
    const prefix = returnContext === "onboarding" ? "?" : "?section=payment&";
    const query = `storeId=${encodeURIComponent(store.id)}`;
    const accountLink = await stripeClient().v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["recipient"],
          refresh_url: `${origin}${path}${prefix}${query}&stripe=refresh`,
          return_url: `${origin}${path}${prefix}${query}&stripe=return`,
          collection_options: { fields: "eventually_due" },
        },
      },
    });
    return {
      onboarding: {
        accountId,
        url: accountLink.url,
        expiresAt: Math.floor(new Date(accountLink.expires_at).getTime() / 1000),
      },
    };
  } catch (error) {
    return stripeError(error, "Stripe could not create the onboarding link.");
  }
});

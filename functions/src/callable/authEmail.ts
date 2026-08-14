import {createHash} from "node:crypto";
import * as admin from "firebase-admin";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {defineString} from "firebase-functions/params";
import {enqueueEmail} from "../email/emailQueueService";
import {emailVerificationEmail, passwordResetEmail} from "../email/emailTemplates";
import {enforceCallableAbuseProtection} from "../security/callableAbuseProtection";

if (admin.apps.length === 0) admin.initializeApp();

const appUrl = defineString("APP_URL", {default: "https://liamarketplace.com"});
const normalizedEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizedEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function opaque(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function trustedOrigin(): string {
  try {
    const url = new URL(appUrl.value());
    if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("APP_URL must be an HTTPS origin.");
    }
    return url.origin;
  } catch {
    throw new HttpsError("failed-precondition", "Authentication email links are not configured.");
  }
}

function actionCode(generatedLink: string): string {
  const link = new URL(generatedLink);
  const direct = link.searchParams.get("oobCode");
  if (direct) return direct;
  const nested = link.searchParams.get("link");
  if (nested) {
    const nestedCode = new URL(nested).searchParams.get("oobCode");
    if (nestedCode) return nestedCode;
  }
  throw new Error("Firebase did not return an authentication action code.");
}

function brandedActionLink(generatedLink: string, path: string, mode: string): string {
  const url = new URL(path, trustedOrigin());
  url.searchParams.set("mode", mode);
  url.searchParams.set("oobCode", actionCode(generatedLink));
  return url.toString();
}

function actionSettings() {
  return {
    url: `${trustedOrigin()}/login`,
    handleCodeInApp: false,
  };
}

function fiveMinuteBucket(): number {
  return Math.floor(Date.now() / (5 * 60 * 1_000));
}

export const requestVerificationEmail = onCall({region: "us-central1"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in before requesting email verification.");
  await enforceCallableAbuseProtection({
    operation: "auth-verification-email",
    uid: request.auth.uid,
    appCheckVerified: Boolean(request.app),
    maximumRequests: 3,
    windowSeconds: 3_600,
  });
  const user = await admin.auth().getUser(request.auth.uid);
  const email = normalizedEmail(user.email);
  if (!email || !normalizedEmailPattern.test(email)) {
    throw new HttpsError("failed-precondition", "This account does not have a valid email address.");
  }
  if (user.emailVerified) return {accepted: true, alreadyVerified: true};

  const generated = await admin.auth().generateEmailVerificationLink(email, actionSettings());
  const template = emailVerificationEmail({
    displayName: user.displayName ?? "",
    url: brandedActionLink(generated, "/verify-email", "verifyEmail"),
  });
  await enqueueEmail({
    dedupeKey: `auth-email-verification:${user.uid}:${fiveMinuteBucket()}`,
    category: "auth_email_verification",
    to: email,
    ...template,
    tags: {auth_type: "verification"},
  });
  return {accepted: true, alreadyVerified: false};
});

export const requestPasswordResetEmail = onCall({region: "us-central1"}, async (request) => {
  const startedAt = Date.now();
  const email = normalizedEmail(request.data?.email);
  const emailKey = opaque(email || "invalid-email");
  const remoteAddress = request.rawRequest.ip || "unknown-address";
  await Promise.all([
    enforceCallableAbuseProtection({
      operation: "auth-password-reset-email",
      uid: `email:${emailKey}`,
      appCheckVerified: Boolean(request.app),
      maximumRequests: 3,
      windowSeconds: 3_600,
    }),
    enforceCallableAbuseProtection({
      operation: "auth-password-reset-ip",
      uid: `ip:${opaque(remoteAddress)}`,
      appCheckVerified: Boolean(request.app),
      maximumRequests: 10,
      windowSeconds: 3_600,
    }),
  ]);

  if (normalizedEmailPattern.test(email)) {
    try {
      const user = await admin.auth().getUserByEmail(email);
      if (!user.disabled) {
        const generated = await admin.auth().generatePasswordResetLink(email, actionSettings());
        const template = passwordResetEmail({
          displayName: user.displayName ?? "",
          url: brandedActionLink(generated, "/reset-password", "resetPassword"),
        });
        await enqueueEmail({
          dedupeKey: `auth-password-reset:${user.uid}:${fiveMinuteBucket()}`,
          category: "auth_password_reset",
          to: email,
          ...template,
          tags: {auth_type: "password_reset"},
        });
      }
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code !== "auth/user-not-found") throw error;
    }
  }

  const minimumResponseTime = 500;
  const remaining = minimumResponseTime - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  return {accepted: true};
});

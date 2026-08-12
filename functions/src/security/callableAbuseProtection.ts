import {createHash} from "node:crypto";
import {
  FieldValue,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";
import {defineString} from "firebase-functions/params";

export interface CallableAbusePolicy {
  operation: string;
  uid: string;
  appCheckVerified: boolean;
  maximumRequests: number;
  windowSeconds: number;
}

interface RateLimitState {
  count?: unknown;
  windowStartedAt?: unknown;
}

const db = getFirestore("default");
const appCheckEnforcementMode = defineString(
  "APP_CHECK_ENFORCEMENT_MODE",
  {default: "monitor"},
);

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function limiterId(operation: string, uid: string): string {
  return createHash("sha256").update(`${operation}:${uid}`).digest("hex");
}

/**
 * Staged App Check verification plus a transactional fixed-window limiter.
 * Set APP_CHECK_ENFORCEMENT_MODE=enforce only after every supported client
 * is registering valid App Check tokens. Until then, missing tokens are
 * recorded for rollout telemetry while throttling is already enforced.
 */
export async function enforceCallableAbuseProtection(
  policy: CallableAbusePolicy,
): Promise<void> {
  const maximumRequests = positiveInteger(policy.maximumRequests, "maximumRequests");
  const windowSeconds = positiveInteger(policy.windowSeconds, "windowSeconds");

  if (
    appCheckEnforcementMode.value() === "enforce" &&
    !policy.appCheckVerified
  ) {
    throw new HttpsError(
      "failed-precondition",
      "This app could not be verified. Update LIA and try again.",
    );
  }

  const reference = db.collection("callableRateLimits")
    .doc(limiterId(policy.operation, policy.uid));
  const now = Date.now();
  const windowMilliseconds = windowSeconds * 1_000;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const state = (snapshot.data() ?? {}) as RateLimitState;
    const startedAt = state.windowStartedAt instanceof Timestamp
      ? state.windowStartedAt.toMillis()
      : 0;
    const currentCount = typeof state.count === "number" ? state.count : 0;
    const sameWindow = startedAt > 0 && now - startedAt < windowMilliseconds;

    if (sameWindow && currentCount >= maximumRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((startedAt + windowMilliseconds - now) / 1_000),
      );
      throw new HttpsError(
        "resource-exhausted",
        `Too many requests. Try again in ${retryAfterSeconds} seconds.`,
      );
    }

    transaction.set(reference, {
      operation: policy.operation,
      ownerId: policy.uid,
      count: sameWindow ? currentCount + 1 : 1,
      windowStartedAt: sameWindow
        ? state.windowStartedAt
        : Timestamp.fromMillis(now),
      windowSeconds,
      maximumRequests,
      lastAppCheckVerified: policy.appCheckVerified,
      ...(policy.appCheckVerified
        ? {verifiedAppCheckCount: FieldValue.increment(1)}
        : {missingAppCheckCount: FieldValue.increment(1)}),
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(now + windowMilliseconds * 2),
    }, {merge: true});
  });
}

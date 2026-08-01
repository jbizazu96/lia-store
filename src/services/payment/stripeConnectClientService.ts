/*
  Store Stripe Connect Client Service.

  Store payout operations are authenticated Firebase callable Functions.
  The browser never calls a Vercel Admin-SDK route and never receives a
  Stripe secret key or trusted Store record.
*/

import {
  httpsCallable,
} from "firebase/functions";
import {
  functions,
} from "@/lib/firebase";
import type {
  StripeConnectAccountSummary,
  StripeOnboardingLinkResult,
} from "@/types/stripeConnect";

export interface CreateStripeAccountResponse {
  account: StripeConnectAccountSummary;
  created: boolean;
}

export interface CreateStripeOnboardingLinkResponse {
  onboarding: StripeOnboardingLinkResult;
}

export interface StripeAccountStatusResponse {
  account: StripeConnectAccountSummary | null;
  connected: boolean;
}

export class StripeConnectClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "StripeConnectClientError";
  }
}

async function call<T>(name: string, storeId: string, data: Record<string, unknown> = {}): Promise<T> {
  const normalizedStoreId = storeId.trim();

  if (!normalizedStoreId) {
    throw new StripeConnectClientError(
      "A valid store ID is required.",
      "INVALID_STORE_ID",
      400,
    );
  }

  try {
    const result = await httpsCallable<Record<string, unknown>, T>(
      functions,
      name,
    )({ storeId: normalizedStoreId, ...data });

    return result.data;
  } catch (cause) {
    const error = cause as {
      code?: unknown;
      message?: unknown;
    };
    const code = typeof error.code === "string" ? error.code : "STRIPE_CONNECT_REQUEST_FAILED";
    const message = typeof error.message === "string" && error.message
      ? error.message
      : "The Stripe request could not be completed.";

    throw new StripeConnectClientError(message, code, 500);
  }
}

export function isStripeConnectClientError(
  error: unknown,
): error is StripeConnectClientError {
  return error instanceof StripeConnectClientError;
}

export const stripeConnectClientService = {
  createOrRetrieveAccount(storeId: string) {
    return call<CreateStripeAccountResponse>(
      "createOrRetrieveStoreStripeAccount",
      storeId,
    );
  },

  createOnboardingLink(
    storeId: string,
    returnContext?: "onboarding",
  ) {
    return call<CreateStripeOnboardingLinkResponse>(
      "createStoreStripeOnboardingLink",
      storeId,
      returnContext ? { returnContext } : {},
    );
  },

  getAccountStatus(storeId: string) {
    return call<StripeAccountStatusResponse>(
      "getStoreStripeAccountStatus",
      storeId,
    );
  },
};

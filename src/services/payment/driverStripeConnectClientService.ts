/*
|--------------------------------------------------------------------------
| Driver Stripe Connect Client Service
|--------------------------------------------------------------------------
|
| The driver onboarding UI never calls Stripe or Firebase Admin directly.
| It uses this authenticated client service to call the protected route.
|
*/

import {
  getAuth,
} from "firebase/auth";
import type {
  StripeConnectAccountSummary,
  StripeOnboardingLinkResult,
} from "@/types/stripeConnect";

export class DriverStripeConnectClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message);
    this.name = "DriverStripeConnectClientError";
  }
}

interface DriverStripeResponse {
  account: StripeConnectAccountSummary | null;
  created?: boolean;
  onboarding?: StripeOnboardingLinkResult;
}

async function post(action: "create_account" | "create_onboarding_link" | "get_status"): Promise<DriverStripeResponse> {
  const user = getAuth().currentUser;

  if (!user) {
    throw new DriverStripeConnectClientError("You must sign in before managing payouts.", "USER_NOT_AUTHENTICATED", 401);
  }

  const response = await fetch("/api/stripe/driver/connect", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify({ action }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new DriverStripeConnectClientError(
      payload.error ?? "The Stripe request could not be completed.",
      payload.code ?? "DRIVER_STRIPE_REQUEST_FAILED",
      response.status
    );
  }

  return payload as DriverStripeResponse;
}

export function isDriverStripeConnectClientError(error: unknown): error is DriverStripeConnectClientError {
  return error instanceof DriverStripeConnectClientError;
}

export const driverStripeConnectClientService = {
  createOrRetrieveAccount: () => post("create_account"),
  async createOnboardingLink() {
    const result = await post("create_onboarding_link");

    if (!result.onboarding) {
      throw new DriverStripeConnectClientError("Stripe did not return an onboarding link.", "MISSING_ONBOARDING_LINK", 502);
    }

    return { onboarding: result.onboarding };
  },
  getAccountStatus: () => post("get_status"),
};

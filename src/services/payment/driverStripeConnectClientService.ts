/*
|--------------------------------------------------------------------------
| Driver Stripe Connect Client Service
|--------------------------------------------------------------------------
|
| The driver onboarding UI never calls Stripe or Firebase Admin directly.
| It uses this authenticated client service to call the protected route.
|
*/

import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
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

async function call(name: string): Promise<DriverStripeResponse> {
  try {
    const response = await httpsCallable<unknown, DriverStripeResponse>(
      functions,
      name,
    )();
    return response.data;
  } catch (cause) {
    const error = cause as { code?: unknown; message?: unknown };
    throw new DriverStripeConnectClientError(
      typeof error.message === "string" ? error.message : "The Stripe request could not be completed.",
      typeof error.code === "string" ? error.code : "DRIVER_STRIPE_REQUEST_FAILED",
      error.code === "functions/unauthenticated" || error.code === "functions/permission-denied" ? 403 : 500,
    );
  }
}

export function isDriverStripeConnectClientError(error: unknown): error is DriverStripeConnectClientError {
  return error instanceof DriverStripeConnectClientError;
}

export const driverStripeConnectClientService = {
  createOrRetrieveAccount: () => call("createOrRetrieveDriverStripeAccount"),
  async createOnboardingLink() {
    const result = await call("createDriverStripeOnboardingLink");

    if (!result.onboarding) {
      throw new DriverStripeConnectClientError("Stripe did not return an onboarding link.", "MISSING_ONBOARDING_LINK", 502);
    }

    return { onboarding: result.onboarding };
  },
  getAccountStatus: () => call("getDriverStripeAccountStatus"),
};

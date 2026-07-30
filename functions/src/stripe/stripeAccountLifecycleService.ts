/*
|--------------------------------------------------------------------------
| Stripe Account Lifecycle Service
|--------------------------------------------------------------------------
|
| Shared Stripe Accounts v2 lifecycle operations.
|
| This service centralizes actions that can be performed on connected
| Stripe accounts regardless of whether they belong to:
|
| - Store owners
| - Drivers
|
| Keeping these operations together avoids duplicating Stripe logic
| across multiple domains.
|
*/

import Stripe from "stripe";

/*
|--------------------------------------------------------------------------
| Result Types
|--------------------------------------------------------------------------
*/

export interface CloseStripeAccountResult {
  accountId: string;
  closed: boolean;
}

/*
|--------------------------------------------------------------------------
| Service Error
|--------------------------------------------------------------------------
*/

export class StripeAccountLifecycleServiceError extends Error {
  readonly code: string;
  readonly causeMessage: string | null;

  constructor(
    message: string,
    options: {
      code: string;
      causeMessage?: string;
    }
  ) {
    super(message);

    this.name =
      "StripeAccountLifecycleServiceError";

    this.code =
      options.code;

    this.causeMessage =
      options.causeMessage ?? null;
  }
}

/*
|--------------------------------------------------------------------------
| Validation
|--------------------------------------------------------------------------
*/

function requireAccountId(
  accountId: string
): string {
  const normalized =
    accountId.trim();

  if (!normalized) {
    throw new StripeAccountLifecycleServiceError(
      "Stripe account ID is required.",
      {
        code: "invalid-argument",
      }
    );
  }

  return normalized;
}

/*
|--------------------------------------------------------------------------
| Lifecycle Service
|--------------------------------------------------------------------------
*/

export const stripeAccountLifecycleService = {
  /*
   * Close an Accounts v2 connected account.
   *
   * The caller is responsible for:
   *
   * - Authentication
   * - Ownership verification
   * - Firestore updates
   */
  async closeAccount(
    stripe: Stripe,
    accountId: string
  ): Promise<CloseStripeAccountResult> {
    const normalizedAccountId =
      requireAccountId(
        accountId
      );

    try {
      /*
       * Close the connected Accounts v2 account.
       *
       * Stripe returns the updated account after the operation.
       */
      const account =
        await stripe.v2.core.accounts.close(
          normalizedAccountId
        );

      return {
        accountId:
          account.id,

        closed: true,
      };
    } catch (error: unknown) {
      if (
        error instanceof
        Stripe.errors.StripeError
      ) {
        throw new StripeAccountLifecycleServiceError(
          "Stripe could not close the connected account.",
          {
            code:
              "stripe-close-failed",

            causeMessage:
              error.message,
          }
        );
      }

      throw new StripeAccountLifecycleServiceError(
        "Unexpected Stripe account lifecycle error.",
        {
          code: "unknown",

          causeMessage:
            error instanceof Error
              ? error.message
              : "Unknown error",
        }
      );
    }
  },
};
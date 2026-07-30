/*
  Stripe Connect Accounts v2 service.

  LIA uses separate charges and transfers: customers pay the platform and
  stores receive transfers. In Accounts v2 this is represented by the
  recipient configuration and its stripe_transfers capability.
*/

import "server-only";

import type Stripe from "stripe";

import {stripe} from "@/lib/stripe/stripe";
import type {
  StripeOnboardingLinkResult,
} from "@/types/stripeConnect";

export interface CreateStoreStripeAccountInput {
  storeId: string;
  ownerId: string;
  storeName: string;
  email: string;
  phone?: string;
  country: string;
  entityType: "company" | "individual" | "non_profit";
  productDescription?: string;
}

/* Driver payouts use the same Accounts v2 recipient configuration as stores. */
export interface CreateDriverStripeAccountInput {
  driverId: string;
  email: string;
  phone?: string;
  country: string;
  fullName: string;
}

export interface CreateStripeOnboardingLinkInput {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}

const ACCOUNT_INCLUDES = [
  "configuration.recipient",
  "identity",
  "requirements",
  "future_requirements",
] as const;

async function createStoreAccount(
  input: CreateStoreStripeAccountInput
): Promise<Stripe.V2.Core.Account> {
  const idempotencyKey = `store-connect-account-v2-${input.storeId}`;

  return stripe.v2.core.accounts.create(
    {
      contact_email: input.email,
      contact_phone: input.phone,
      display_name: input.storeName,
      dashboard: "express",
      identity: {
        country: input.country,
        entity_type: input.entityType,
      },

      /*
        Recipient is the Accounts v2 configuration for a business that
        receives platform transfers rather than directly charging customers.
      */
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: {
                requested: true,
              },
            },
          },
        },
      },

      defaults: {
        responsibilities: {
          fees_collector: "application",
          losses_collector: "application",
        },
        profile: {
          doing_business_as: input.storeName,
          product_description:
            input.productDescription ??
            `${input.storeName} sells grocery and retail products through LIA Store.`,
        },
      },

      metadata: {
        liaConnectApiVersion: "v2",
        liaOwnerType: "store",
        liaStoreId: input.storeId,
        liaOwnerId: input.ownerId,
      },
      include: [...ACCOUNT_INCLUDES],
    },
    {idempotencyKey}
  );
}

/*
  Create a driver recipient account.

  LIA makes platform transfers to drivers: 70% of delivery fees and 100% of
  customer tips. Drivers are individual recipients, so Stripe receives that
  trusted identity type from the server rather than the browser.
*/
async function createDriverAccount(
  input: CreateDriverStripeAccountInput
): Promise<Stripe.V2.Core.Account> {
  return stripe.v2.core.accounts.create(
    {
      contact_email: input.email,
      contact_phone: input.phone,
      display_name: input.fullName,
      dashboard: "express",
      identity: {
        country: input.country,
        entity_type: "individual",
      },
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: {
                requested: true,
              },
            },
          },
        },
      },
      defaults: {
        responsibilities: {
          fees_collector: "application",
          losses_collector: "application",
        },
        profile: {
          doing_business_as: input.fullName,
          product_description: "Independent delivery driver receiving payouts through LIA.",
        },
      },
      metadata: {
        liaConnectApiVersion: "v2",
        liaOwnerType: "driver",
        liaDriverId: input.driverId,
        liaOwnerId: input.driverId,
      },
      include: [...ACCOUNT_INCLUDES],
    },
    {
      idempotencyKey: `driver-connect-account-v2-${input.driverId}`,
    }
  );
}

async function getAccount(
  accountId: string
): Promise<Stripe.V2.Core.Account> {
  return stripe.v2.core.accounts.retrieve(accountId, {
    include: [...ACCOUNT_INCLUDES],
  });
}

async function createOnboardingLink(
  input: CreateStripeOnboardingLinkInput
): Promise<StripeOnboardingLinkResult> {
  const collectionOptions = {
    fields: "eventually_due" as const,
  };

  const accountLink = await stripe.v2.core.accountLinks.create({
    account: input.accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["recipient"],
        refresh_url: input.refreshUrl,
        return_url: input.returnUrl,
        collection_options: collectionOptions,
      },
    },
  });

  return {
    accountId: input.accountId,
    url: accountLink.url,
    expiresAt: Math.floor(
      new Date(accountLink.expires_at).getTime() / 1000
    ),
  };
}

export const stripeConnectService = {
  createStoreAccount,
  createDriverAccount,
  getAccount,
  createOnboardingLink,
};

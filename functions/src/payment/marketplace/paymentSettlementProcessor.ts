/**
 * ================================================================
 * Marketplace Payment Settlement Processor
 * ================================================================
 *
 * Converts one eligible settlement into independent store and driver
 * transfer obligations.
 *
 * This processor DOES NOT call Stripe.
 *
 * Responsibilities:
 *
 * - Load and validate the settlement
 * - Validate the original customer-payment source
 * - Mark the settlement as processing
 * - Create one deterministic store transfer
 * - Create one deterministic driver transfer
 * - Associate both transfers with the same customer charge
 * - Mark new or retryable transfers as eligible
 * - Preserve completed or currently processing transfers
 * - Mark the settlement failed if preparation cannot finish
 */

import type {
  MarketplacePaymentTransfer,
  PaymentTransferRecipientType,
  PaymentTransferSource,
} from "./paymentTransferTypes";

import {
  getSettlement,
  markSettlementFailed,
  markSettlementProcessing,
} from "./paymentSettlementService";

import {
  createTransfer,
  getTransfer,
  markTransferEligible,
} from "./paymentTransferService";

/*
|--------------------------------------------------------------------------
| Input
|--------------------------------------------------------------------------
*/

export interface ProcessPaymentSettlementInput {
  settlementId: string;

  storeStripeAccountId: string;

  driverStripeAccountId: string | null;

  /*
   * Original customer payment that funds both connected-account
   * transfers.
   */
  source:
    PaymentTransferSource;
}

/*
|--------------------------------------------------------------------------
| Result
|--------------------------------------------------------------------------
*/

export interface ProcessPaymentSettlementResult {
  settlementId: string;

  orderId: string;

  storeTransfer: {
    transferId: string;
    created: boolean;

    status:
      MarketplacePaymentTransfer["status"];
  };

  driverTransfer: {
    transferId: string;
    created: boolean;

    status:
      MarketplacePaymentTransfer["status"];
  } | null;
}

/*
|--------------------------------------------------------------------------
| Error
|--------------------------------------------------------------------------
*/

export class PaymentSettlementProcessorError extends Error {
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
      "PaymentSettlementProcessorError";

    this.code =
      options.code;

    this.causeMessage =
      options.causeMessage ?? null;
  }
}

/*
|--------------------------------------------------------------------------
| Validation Helpers
|--------------------------------------------------------------------------
*/

function requireIdentifier(
  value: string,
  fieldName: string
): string {
  const normalized =
    value.trim();

  if (
    !normalized
  ) {
    throw new PaymentSettlementProcessorError(
      `${fieldName} is required.`,
      {
        code:
          "invalid-argument",
      }
    );
  }

  if (
    normalized.includes("/") ||
    normalized.includes("\\")
  ) {
    throw new PaymentSettlementProcessorError(
      `${fieldName} contains invalid characters.`,
      {
        code:
          "invalid-argument",
      }
    );
  }

  return normalized;
}

function requirePositiveInteger(
  value: number,
  fieldName: string
): number {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new PaymentSettlementProcessorError(
      `${fieldName} must be a positive integer amount.`,
      {
        code:
          "invalid-amount",
      }
    );
  }

  return value;
}

function requireStripeAccountId(
  value: string,
  fieldName: string
): string {
  const normalized =
    requireIdentifier(
      value,
      fieldName
    );

  if (
    !normalized.startsWith(
      "acct_"
    )
  ) {
    throw new PaymentSettlementProcessorError(
      `${fieldName} is invalid.`,
      {
        code:
          "invalid-stripe-account-id",
      }
    );
  }

  return normalized;
}

function requireTransferSource(
  source:
    PaymentTransferSource
): PaymentTransferSource {
  const stripePaymentIntentId =
    requireIdentifier(
      source.stripePaymentIntentId,
      "Stripe PaymentIntent ID"
    );

  const stripeChargeId =
    requireIdentifier(
      source.stripeChargeId,
      "Stripe charge ID"
    );

  const transferGroup =
    requireIdentifier(
      source.transferGroup,
      "Transfer group"
    );

  if (
    !stripePaymentIntentId.startsWith(
      "pi_"
    )
  ) {
    throw new PaymentSettlementProcessorError(
      "Stripe PaymentIntent ID is invalid.",
      {
        code:
          "invalid-payment-intent-id",
      }
    );
  }

  if (
    !stripeChargeId.startsWith(
      "ch_"
    )
  ) {
    throw new PaymentSettlementProcessorError(
      "Stripe charge ID is invalid.",
      {
        code:
          "invalid-charge-id",
      }
    );
  }

  return {
    stripePaymentIntentId,
    stripeChargeId,
    transferGroup,
  };
}

/*
|--------------------------------------------------------------------------
| Transfer Eligibility
|--------------------------------------------------------------------------
|
| A retry must never move a completed transfer back to eligible.
|
| Current behavior:
|
| pending    → eligible
| failed     → eligible
| eligible   → unchanged
| processing → unchanged
| completed  → unchanged
| cancelled  → rejected
|
*/

async function ensureTransferEligible(
  transferId: string,
  recipientType:
    PaymentTransferRecipientType
): Promise<
  MarketplacePaymentTransfer
> {
  const transfer =
    await getTransfer(
      transferId
    );

  if (
    !transfer
  ) {
    throw new PaymentSettlementProcessorError(
      `The ${recipientType} transfer could not be loaded after creation.`,
      {
        code:
          "transfer-not-found",
      }
    );
  }

  if (
    transfer.status ===
    "cancelled"
  ) {
    throw new PaymentSettlementProcessorError(
      `The ${recipientType} transfer was cancelled and cannot be processed.`,
      {
        code:
          "transfer-cancelled",
      }
    );
  }

  if (
    transfer.status ===
      "pending" ||
    transfer.status ===
      "failed"
  ) {
    await markTransferEligible(
      transfer.id
    );

    const updatedTransfer =
      await getTransfer(
        transfer.id
      );

    if (
      !updatedTransfer
    ) {
      throw new PaymentSettlementProcessorError(
        `The eligible ${recipientType} transfer could not be reloaded.`,
        {
          code:
            "transfer-not-found",
        }
      );
    }

    return updatedTransfer;
  }

  return transfer;
}

/*
|--------------------------------------------------------------------------
| Processor
|--------------------------------------------------------------------------
*/

export const paymentSettlementProcessor = {
  async process(
    input:
      ProcessPaymentSettlementInput
  ): Promise<
    ProcessPaymentSettlementResult
  > {
    const settlementId =
      requireIdentifier(
        input.settlementId,
        "Settlement ID"
      );

    const storeStripeAccountId =
      requireStripeAccountId(
        input.storeStripeAccountId,
        "Store Stripe account ID"
      );

    const driverStripeAccountId = input.driverStripeAccountId === null
      ? null
      : requireStripeAccountId(input.driverStripeAccountId, "Driver Stripe account ID");

    const source =
      requireTransferSource(
        input.source
      );

    try {
      /*
       * Load the financial obligation created for the delivered order.
       */
      const settlement =
        await getSettlement(
          settlementId
        );

      if (
        !settlement
      ) {
        throw new PaymentSettlementProcessorError(
          "The payment settlement was not found.",
          {
            code:
              "settlement-not-found",
          }
        );
      }

      /*
       * A completed settlement must never be prepared again.
       */
      if (
        settlement.status ===
        "completed"
      ) {
        throw new PaymentSettlementProcessorError(
          "The payment settlement has already been completed.",
          {
            code:
              "settlement-completed",
          }
        );
      }

      if (
        settlement.status !==
          "eligible" &&
        settlement.status !==
          "processing" &&
        settlement.status !==
          "failed"
      ) {
        throw new PaymentSettlementProcessorError(
          "The payment settlement is not ready for transfer preparation.",
          {
            code:
              "invalid-settlement-status",
          }
        );
      }

      const orderId =
        requireIdentifier(
          settlement.orderId,
          "Order ID"
        );

      const storeId =
        requireIdentifier(
          settlement.storeId,
          "Store ID"
        );

      const driverId = settlement.driverId === null
        ? null
        : requireIdentifier(settlement.driverId, "Driver ID");

      const storeAmount =
        requirePositiveInteger(
          settlement.storeAmount,
          "Store settlement amount"
        );

      const driverAmount = settlement.driverAmount;
      if (!Number.isSafeInteger(driverAmount) || driverAmount < 0 || (driverId === null) !== (driverAmount === 0)) {
        throw new PaymentSettlementProcessorError(
          "The driver settlement allocation is invalid.",
          {code: "invalid-driver-allocation"},
        );
      }
      if ((driverStripeAccountId === null) !== (driverId === null)) {
        throw new PaymentSettlementProcessorError(
          "The driver payout account does not match the settlement.",
          {code: "invalid-driver-allocation"},
        );
      }

      if (
        settlement.currency !==
        "usd"
      ) {
        throw new PaymentSettlementProcessorError(
          "Only USD settlements are currently supported.",
          {
            code:
              "unsupported-currency",
          }
        );
      }

      /*
       * Processing means the settlement is being converted into
       * participant transfer obligations.
       */
      await markSettlementProcessing(
        settlementId
      );

      /*
       * Both recipients are paid from the same original customer charge.
       *
       * Deterministic transfer IDs inside createTransfer() guarantee
       * exactly one store obligation and one driver obligation.
       */
      const storeCreation =
        await createTransfer({
          settlementId,

          orderId,

          recipient: {
            type:
              "store",

            id:
              storeId,

            stripeAccountId:
              storeStripeAccountId,
          },

          source,

          amount:
            storeAmount,

          currency:
            "usd",
        });

      const driverCreation = driverId && driverStripeAccountId ?
        await createTransfer({
          settlementId,

          orderId,

          recipient: {
            type:
              "driver",

            id:
              driverId,

            stripeAccountId:
              driverStripeAccountId,
          },

          source,

          amount:
            driverAmount,

          currency:
            "usd",
        }) : null;

      /*
       * Retries preserve transfers already processing or completed.
       */
      const storeTransfer =
        await ensureTransferEligible(
          storeCreation.transferId,
          "store"
        );

      const driverTransfer = driverCreation
        ? await ensureTransferEligible(driverCreation.transferId, "driver")
        : null;

      return {
        settlementId,

        orderId,

        storeTransfer: {
          transferId:
            storeTransfer.id,

          created:
            storeCreation.created,

          status:
            storeTransfer.status,
        },

        driverTransfer: driverTransfer && driverCreation ? {
          transferId:
            driverTransfer.id,

          created:
            driverCreation.created,

          status:
            driverTransfer.status,
        } : null,
      };
    } catch (
      error: unknown
    ) {
      /*
       * Best-effort failure recording.
       *
       * The original failure remains the primary error even when the
       * settlement status update also fails.
       */
      try {
        await markSettlementFailed(
          settlementId
        );
      } catch (
        settlementFailureError:
          unknown
      ) {
        console.error(
          "Unable to mark payment settlement failed.",
          {
            settlementId,
            settlementFailureError,
          }
        );
      }

      if (
        error instanceof
        PaymentSettlementProcessorError
      ) {
        throw error;
      }

      const causeMessage =
        error instanceof Error
          ? error.message
          : "Unknown settlement processing error.";

      throw new PaymentSettlementProcessorError(
        "The marketplace settlement could not be prepared for transfer.",
        {
          code:
            "settlement-processing-failed",

          causeMessage,
        }
      );
    }
  },
};

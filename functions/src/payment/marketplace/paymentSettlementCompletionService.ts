/*
|--------------------------------------------------------------------------
| Payment Settlement Completion Service
|--------------------------------------------------------------------------
|
| Completes one marketplace settlement after both participant transfers
| have completed successfully.
|
| One settlement normally has:
|
| - One store transfer
| - One driver transfer
|
| This service:
|
| - Loads the settlement
| - Loads both deterministic transfer records
| - Verifies both Stripe transfers completed
| - Marks the settlement completed
| - Creates immutable completion ledger entries
|
| This service does not call Stripe.
|
| Marketplace decides.
| Stripe executes.
|
*/

import type {
  MarketplacePaymentTransfer,
} from "./paymentTransferTypes";

import {
  createLedgerEntry,
} from "./paymentLedgerService";

import {
  getSettlement,
  markSettlementCompleted,
} from "./paymentSettlementService";

import {
  createTransferDocumentId,
  getTransfer,
} from "./paymentTransferService";

/*
|--------------------------------------------------------------------------
| Input
|--------------------------------------------------------------------------
*/

export interface CompletePaymentSettlementInput {
  settlementId: string;
}

/*
|--------------------------------------------------------------------------
| Result
|--------------------------------------------------------------------------
*/

export interface CompletePaymentSettlementResult {
  settlementId: string;

  orderId: string;

  completed: boolean;

  alreadyCompleted: boolean;

  storeTransferCompleted: boolean;

  driverTransferCompleted: boolean;
}

/*
|--------------------------------------------------------------------------
| Errors
|--------------------------------------------------------------------------
*/

export type PaymentSettlementCompletionErrorCode =
  | "INVALID_ARGUMENT"
  | "SETTLEMENT_NOT_FOUND"
  | "STORE_TRANSFER_NOT_FOUND"
  | "DRIVER_TRANSFER_NOT_FOUND"
  | "TRANSFER_SETTLEMENT_MISMATCH"
  | "INVALID_TRANSFER_RECIPIENT"
  | "SETTLEMENT_COMPLETION_FAILED";

export class PaymentSettlementCompletionError extends Error {
  readonly code:
    PaymentSettlementCompletionErrorCode;

  readonly causeMessage:
    string | null;

  constructor(
    code:
      PaymentSettlementCompletionErrorCode,
    message: string,
    causeMessage?: string
  ) {
    super(message);

    this.name =
      "PaymentSettlementCompletionError";

    this.code =
      code;

    this.causeMessage =
      causeMessage ?? null;
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

  if (!normalized) {
    throw new PaymentSettlementCompletionError(
      "INVALID_ARGUMENT",
      `${fieldName} is required.`
    );
  }

  if (
    normalized.includes("/") ||
    normalized.includes("\\")
  ) {
    throw new PaymentSettlementCompletionError(
      "INVALID_ARGUMENT",
      `${fieldName} contains invalid characters.`
    );
  }

  return normalized;
}

function getSafeErrorMessage(
  error: unknown
): string {
  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message.trim();
  }

  return "Unknown settlement completion failure.";
}

/*
|--------------------------------------------------------------------------
| Transfer Validation
|--------------------------------------------------------------------------
*/

function validateTransferRelationship(
  transfer:
    MarketplacePaymentTransfer,
  settlementId: string,
  orderId: string,
  expectedRecipient:
    "store" | "driver"
): void {
  if (
    transfer.settlementId !==
    settlementId ||
    transfer.orderId !==
    orderId
  ) {
    throw new PaymentSettlementCompletionError(
      "TRANSFER_SETTLEMENT_MISMATCH",
      `The ${expectedRecipient} transfer does not belong to this settlement.`
    );
  }

  if (
    transfer.recipient.type !==
    expectedRecipient
  ) {
    throw new PaymentSettlementCompletionError(
      "INVALID_TRANSFER_RECIPIENT",
      `The expected ${expectedRecipient} transfer has an invalid recipient type.`
    );
  }
}

/*
|--------------------------------------------------------------------------
| Completion Service
|--------------------------------------------------------------------------
*/

async function complete(
  input:
    CompletePaymentSettlementInput
): Promise<
  CompletePaymentSettlementResult
> {
  const settlementId =
    requireIdentifier(
      input.settlementId,
      "Settlement ID"
    );

  try {
    /*
    |--------------------------------------------------------------------------
    | Load Settlement
    |--------------------------------------------------------------------------
    */

    const settlement =
      await getSettlement(
        settlementId
      );

    if (!settlement) {
      throw new PaymentSettlementCompletionError(
        "SETTLEMENT_NOT_FOUND",
        "The marketplace settlement was not found."
      );
    }

    const orderId =
      requireIdentifier(
        settlement.orderId,
        "Order ID"
      );

    /*
    |--------------------------------------------------------------------------
    | Load Deterministic Transfers
    |--------------------------------------------------------------------------
    */

    const storeTransferId =
      createTransferDocumentId(
        settlementId,
        "store"
      );

    const driverTransferId =
      createTransferDocumentId(
        settlementId,
        "driver"
      );
    const hasDriverTransfer = settlement.driverId !== null && settlement.driverAmount > 0;

    const [
      storeTransfer,
      driverTransfer,
    ] =
      await Promise.all([
        getTransfer(
          storeTransferId
        ),

        hasDriverTransfer ? getTransfer(driverTransferId) : Promise.resolve(null),
      ]);

    if (!storeTransfer) {
      throw new PaymentSettlementCompletionError(
        "STORE_TRANSFER_NOT_FOUND",
        "The store transfer was not found."
      );
    }

    if (hasDriverTransfer && !driverTransfer) {
      throw new PaymentSettlementCompletionError(
        "DRIVER_TRANSFER_NOT_FOUND",
        "The driver transfer was not found."
      );
    }

    validateTransferRelationship(
      storeTransfer,
      settlementId,
      orderId,
      "store"
    );

    if (driverTransfer) {
      validateTransferRelationship(driverTransfer, settlementId, orderId, "driver");
    }

    const storeTransferCompleted =
      storeTransfer.status ===
      "completed";

    const driverTransferCompleted = !hasDriverTransfer || driverTransfer?.status === "completed";

    /*
    |--------------------------------------------------------------------------
    | Wait For Both Transfers
    |--------------------------------------------------------------------------
    |
    | One transfer may complete before the other.
    |
    | In that case, leave the settlement processing and return without
    | treating the incomplete participant as an error.
    |
    */

    if (
      !storeTransferCompleted ||
      !driverTransferCompleted
    ) {
      return {
        settlementId,

        orderId,

        completed:
          false,

        alreadyCompleted:
          settlement.status ===
          "completed",

        storeTransferCompleted,

        driverTransferCompleted,
      };
    }

    /*
    |--------------------------------------------------------------------------
    | Completion Ledger
    |--------------------------------------------------------------------------
    |
    | Deterministic event keys prevent retries from duplicating entries.
    |
    */

    await createLedgerEntry({
      orderId,

      event:
        "store_transfer_completed",

      eventKey:
        "store_transfer_completed",

      amount:
        storeTransfer.amount,

      description:
        "Store Stripe transfer completed.",

      metadata: {
        settlementId,

        transferId:
          storeTransfer.id,

        stripeTransferId:
          storeTransfer
            .stripeTransferId,

        storeId:
          storeTransfer
            .recipient.id,

        stripeAccountId:
          storeTransfer
            .recipient
            .stripeAccountId,
      },
    });

    if (driverTransfer) await createLedgerEntry({
      orderId,

      event:
        "driver_transfer_completed",

      eventKey:
        "driver_transfer_completed",

      amount:
        driverTransfer.amount,

      description:
        "Driver Stripe transfer completed.",

      metadata: {
        settlementId,

        transferId:
          driverTransfer.id,

        stripeTransferId:
          driverTransfer
            .stripeTransferId,

        driverId:
          driverTransfer
            .recipient.id,

        stripeAccountId:
          driverTransfer
            .recipient
            .stripeAccountId,
      },
    });

    await createLedgerEntry({
      orderId,

      event:
        "settlement_completed",

      eventKey:
        "settlement_completed",

      amount:
        storeTransfer.amount +
        (driverTransfer?.amount ?? 0),

      description:
        "Store and driver marketplace settlement completed.",

      metadata: {
        settlementId,

        storeTransferId:
          storeTransfer.id,

        storeStripeTransferId:
          storeTransfer
            .stripeTransferId,

        driverTransferId:
          driverTransfer?.id ?? null,

        driverStripeTransferId:
          driverTransfer?.stripeTransferId ?? null,
      },
    });

    /*
    |--------------------------------------------------------------------------
    | Mark Settlement Completed
    |--------------------------------------------------------------------------
    */

    const alreadyCompleted =
      settlement.status ===
      "completed";

    if (!alreadyCompleted) {
      await markSettlementCompleted(
        settlementId
      );
    }

    return {
      settlementId,

      orderId,

      completed:
        true,

      alreadyCompleted,

      storeTransferCompleted:
        true,

      driverTransferCompleted:
        true,
    };
  } catch (
    error: unknown
  ) {
    if (
      error instanceof
      PaymentSettlementCompletionError
    ) {
      throw error;
    }

    const causeMessage =
      getSafeErrorMessage(
        error
      );

    throw new PaymentSettlementCompletionError(
      "SETTLEMENT_COMPLETION_FAILED",
      "The marketplace settlement could not be completed.",
      causeMessage
    );
  }
}

/*
|--------------------------------------------------------------------------
| Type Guard
|--------------------------------------------------------------------------
*/

export function isPaymentSettlementCompletionError(
  error: unknown
): error is PaymentSettlementCompletionError {
  return (
    error instanceof
    PaymentSettlementCompletionError
  );
}

/*
|--------------------------------------------------------------------------
| Service
|--------------------------------------------------------------------------
*/

export const paymentSettlementCompletionService = {
  complete,
};

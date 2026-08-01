/**
 * ================================================================
 * Marketplace Payment Transfer Service
 * ================================================================
 *
 * Creates and manages internal marketplace transfer records.
 *
 * IMPORTANT
 * ----------
 * This service does not call Stripe.
 *
 * It prepares one deterministic transfer obligation for each
 * settlement recipient.
 *
 * Deterministic Firestore document IDs and Stripe idempotency keys
 * prevent retries from creating duplicate store or driver payments.
 */

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

import {
  CreateMarketplacePaymentTransferInput,
  MarketplacePaymentTransfer,
  PaymentTransferRecipientType,
  PaymentTransferSource,
} from "./paymentTransferTypes";

/*
|--------------------------------------------------------------------------
| Constants
|--------------------------------------------------------------------------
*/

const COLLECTION =
  "paymentTransfers";

/*
|--------------------------------------------------------------------------
| Errors
|--------------------------------------------------------------------------
*/

export class PaymentTransferServiceError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);

    this.name =
      "PaymentTransferServiceError";
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
    throw new PaymentTransferServiceError(
      `${fieldName} is required.`,
      "invalid-argument"
    );
  }

  if (
    normalized.includes("/") ||
    normalized.includes("\\")
  ) {
    throw new PaymentTransferServiceError(
      `${fieldName} contains invalid characters.`,
      "invalid-argument"
    );
  }

  return normalized;
}

function requireStripePaymentIntentId(
  value: string
): string {
  const normalized =
    requireIdentifier(
      value,
      "Stripe PaymentIntent ID"
    );

  if (
    !normalized.startsWith("pi_")
  ) {
    throw new PaymentTransferServiceError(
      "Stripe PaymentIntent ID is invalid.",
      "invalid-payment-intent-id"
    );
  }

  return normalized;
}

function requireStripeChargeId(
  value: string
): string {
  const normalized =
    requireIdentifier(
      value,
      "Stripe charge ID"
    );

  if (
    !normalized.startsWith("ch_")
  ) {
    throw new PaymentTransferServiceError(
      "Stripe charge ID is invalid.",
      "invalid-charge-id"
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
    throw new PaymentTransferServiceError(
      `${fieldName} must be a positive integer amount.`,
      "invalid-amount"
    );
  }

  return value;
}

function requireRecipientType(
  value: PaymentTransferRecipientType
): PaymentTransferRecipientType {
  if (
    value !== "store" &&
    value !== "driver"
  ) {
    throw new PaymentTransferServiceError(
      "Transfer recipient type is invalid.",
      "invalid-recipient-type"
    );
  }

  return value;
}

function requireTransferSource(
  source: PaymentTransferSource
): PaymentTransferSource {
  return {
    stripePaymentIntentId:
      requireStripePaymentIntentId(
        source.stripePaymentIntentId
      ),

    stripeChargeId:
      requireStripeChargeId(
        source.stripeChargeId
      ),

    transferGroup:
      requireIdentifier(
        source.transferGroup,
        "Transfer group"
      ),
  };
}

/*
|--------------------------------------------------------------------------
| Deterministic Transfer Identity
|--------------------------------------------------------------------------
|
| One settlement may create exactly:
|
| - one store transfer
| - one driver transfer
|
| Examples:
|
| settlement_123_store
| settlement_123_driver
|
*/

export function createTransferDocumentId(
  settlementIdInput: string,
  recipientTypeInput:
    PaymentTransferRecipientType
): string {
  const settlementId =
    requireIdentifier(
      settlementIdInput,
      "Settlement ID"
    );

  const recipientType =
    requireRecipientType(
      recipientTypeInput
    );

  return `${settlementId}_${recipientType}`;
}

/*
|--------------------------------------------------------------------------
| Stripe Idempotency Key
|--------------------------------------------------------------------------
|
| Stripe remembers the result associated with an idempotency key.
|
| Retrying the same transfer therefore resolves to the same Stripe
| operation instead of paying the recipient again.
|
*/

export function createStripeTransferIdempotencyKey(
  transferIdInput: string
): string {
  const transferId =
    requireIdentifier(
      transferIdInput,
      "Transfer ID"
    );

  return `lia-marketplace-transfer-${transferId}`;
}

/*
|--------------------------------------------------------------------------
| Create Transfer
|--------------------------------------------------------------------------
*/

export async function createTransfer(
  input:
    CreateMarketplacePaymentTransferInput
): Promise<{
  transferId: string;
  created: boolean;
}> {
  const settlementId =
    requireIdentifier(
      input.settlementId,
      "Settlement ID"
    );

  const orderId =
    requireIdentifier(
      input.orderId,
      "Order ID"
    );

  const recipientType =
    requireRecipientType(
      input.recipient.type
    );

  const recipientId =
    requireIdentifier(
      input.recipient.id,
      "Recipient ID"
    );

  const stripeAccountId =
    requireIdentifier(
      input.recipient.stripeAccountId,
      "Stripe account ID"
    );

  if (
    !stripeAccountId.startsWith(
      "acct_"
    )
  ) {
    throw new PaymentTransferServiceError(
      "The recipient Stripe account ID is invalid.",
      "invalid-stripe-account-id"
    );
  }

  const source =
    requireTransferSource(
      input.source
    );

  const amount =
    requirePositiveInteger(
      input.amount,
      "Transfer amount"
    );

  if (
    input.currency !==
    "usd"
  ) {
    throw new PaymentTransferServiceError(
      "Only USD transfers are currently supported.",
      "unsupported-currency"
    );
  }

  const transferId =
    createTransferDocumentId(
      settlementId,
      recipientType
    );

  const stripeIdempotencyKey =
    createStripeTransferIdempotencyKey(
      transferId
    );

  const db =
    getFirestore("default");

  const transferReference =
    db
      .collection(COLLECTION)
      .doc(transferId);

  const created =
    await db.runTransaction(
      async (transaction) => {
        const snapshot =
          await transaction.get(
            transferReference
          );

        if (
          snapshot.exists
        ) {
          const existing =
            snapshot.data();

          /*
           * A deterministic ID must always represent the same financial
           * obligation.
           *
           * If any immutable value differs, stop instead of modifying or
           * duplicating money already owed.
           */
          const matches =
            existing?.settlementId ===
              settlementId &&
            existing?.orderId ===
              orderId &&
            existing?.recipient?.type ===
              recipientType &&
            existing?.recipient?.id ===
              recipientId &&
            existing?.recipient
              ?.stripeAccountId ===
              stripeAccountId &&
            existing?.source
              ?.stripePaymentIntentId ===
              source.stripePaymentIntentId &&
            existing?.source
              ?.stripeChargeId ===
              source.stripeChargeId &&
            existing?.source
              ?.transferGroup ===
              source.transferGroup &&
            existing?.amount ===
              amount &&
            existing?.currency ===
              input.currency &&
            existing?.stripeIdempotencyKey ===
              stripeIdempotencyKey;

          if (
            !matches
          ) {
            throw new PaymentTransferServiceError(
              "An existing transfer conflicts with the requested financial obligation.",
              "transfer-conflict"
            );
          }

          return false;
        }

        const now =
          new Date().toISOString();

        const transfer:
          MarketplacePaymentTransfer = {
            id:
              transferId,

            settlementId,

            orderId,

            recipient: {
              type:
                recipientType,

              id:
                recipientId,

              stripeAccountId,
            },

            source,

            amount,

            currency:
              input.currency,

            status:
              "pending",

            stripeIdempotencyKey,

            attemptCount:
              0,

            createdAt:
              now,

            updatedAt:
              now,
          };

        transaction.create(
          transferReference,
          transfer
        );

        return true;
      }
    );

  return {
    transferId,
    created,
  };
}

/*
|--------------------------------------------------------------------------
| Read Transfer
|--------------------------------------------------------------------------
*/

export async function getTransfer(
  transferIdInput: string
): Promise<
  MarketplacePaymentTransfer | null
> {
  const transferId =
    requireIdentifier(
      transferIdInput,
      "Transfer ID"
    );

  const document =
    await getFirestore("default")
      .collection(COLLECTION)
      .doc(transferId)
      .get();

  if (
    !document.exists
  ) {
    return null;
  }

  return document.data() as
    MarketplacePaymentTransfer;
}

/*
|--------------------------------------------------------------------------
| Transfer State Updates
|--------------------------------------------------------------------------
*/

export async function markTransferEligible(
  transferIdInput: string
): Promise<void> {
  const transferId =
    requireIdentifier(
      transferIdInput,
      "Transfer ID"
    );

  await getFirestore("default")
    .collection(COLLECTION)
    .doc(transferId)
    .update({
      status:
        "eligible",

      updatedAt:
        new Date().toISOString(),
    });
}

export async function markTransferProcessing(
  transferIdInput: string
): Promise<void> {
  const transferId =
    requireIdentifier(
      transferIdInput,
      "Transfer ID"
    );

  await getFirestore("default")
    .collection(COLLECTION)
    .doc(transferId)
    .update({
      status:
        "processing",

      attemptCount:
        FieldValue.increment(1),

      lastError:
        FieldValue.delete(),

      nextRetryAt:
        FieldValue.delete(),

      updatedAt:
        new Date().toISOString(),
    });
}

export async function markTransferCompleted(
  transferIdInput: string,
  stripeTransferIdInput: string
): Promise<void> {
  const transferId =
    requireIdentifier(
      transferIdInput,
      "Transfer ID"
    );

  const stripeTransferId =
    requireIdentifier(
      stripeTransferIdInput,
      "Stripe transfer ID"
    );

  if (
    !stripeTransferId.startsWith(
      "tr_"
    )
  ) {
    throw new PaymentTransferServiceError(
      "Stripe transfer ID is invalid.",
      "invalid-stripe-transfer-id"
    );
  }

  const now =
    new Date().toISOString();

  await getFirestore("default")
    .collection(COLLECTION)
    .doc(transferId)
    .update({
      status:
        "completed",

      stripeTransferId,

      completedAt:
        now,

      lastError:
        FieldValue.delete(),

      nextRetryAt:
        FieldValue.delete(),

      updatedAt:
        now,
    });
}

export async function markTransferFailed(
  transferIdInput: string,
  errorMessageInput: string,
  nextRetryAt?: string
): Promise<void> {
  const transferId =
    requireIdentifier(
      transferIdInput,
      "Transfer ID"
    );

  const errorMessage =
    errorMessageInput.trim() ||
    "Unknown transfer failure.";

  await getFirestore("default")
    .collection(COLLECTION)
    .doc(transferId)
    .update({
      status:
        "failed",

      lastError:
        errorMessage,

      ...(nextRetryAt
        ? {
            nextRetryAt,
          }
        : {
            nextRetryAt:
              FieldValue.delete(),
          }),

      updatedAt:
        new Date().toISOString(),
    });
}
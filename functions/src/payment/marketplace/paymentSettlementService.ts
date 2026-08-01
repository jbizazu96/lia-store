/*
|--------------------------------------------------------------------------
| Marketplace Payment Settlement Service
|--------------------------------------------------------------------------
|
| A settlement records the immutable amount LIA owes to the store and
| driver after a paid order is successfully delivered.
|
| This service does not call Stripe.
|
| Important safety rule:
|
| One order may have exactly one marketplace settlement.
|
| The deterministic settlement ID and transactional conflict validation
| prevent duplicate or modified financial obligations during retries.
|
*/

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

import type {
  PaymentSettlement,
  PaymentSettlementStatus,
} from "./paymentSettlementTypes";

/*
|--------------------------------------------------------------------------
| Constants
|--------------------------------------------------------------------------
*/

const COLLECTION =
  "paymentSettlements";

/*
|--------------------------------------------------------------------------
| Create Input
|--------------------------------------------------------------------------
*/

export interface CreatePaymentSettlementInput {
  orderId: string;

  storeId: string;

  driverId: string;

  storeAmount: number;

  driverAmount: number;

  currency: "usd";
}

/*
|--------------------------------------------------------------------------
| Create Result
|--------------------------------------------------------------------------
*/

export interface CreatePaymentSettlementResult {
  settlementId: string;

  created: boolean;

  settlement:
    PaymentSettlement;
}

/*
|--------------------------------------------------------------------------
| Error
|--------------------------------------------------------------------------
*/

export class PaymentSettlementServiceError extends Error {
  readonly code: string;

  constructor(
    message: string,
    code: string
  ) {
    super(message);

    this.name =
      "PaymentSettlementServiceError";

    this.code =
      code;
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
    throw new PaymentSettlementServiceError(
      `${fieldName} is required.`,
      "invalid-argument"
    );
  }

  if (
    normalized.includes("/") ||
    normalized.includes("\\")
  ) {
    throw new PaymentSettlementServiceError(
      `${fieldName} contains invalid characters.`,
      "invalid-argument"
    );
  }

  return normalized;
}

function requirePositiveCentAmount(
  value: number,
  fieldName: string
): number {
  if (
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new PaymentSettlementServiceError(
      `${fieldName} must be a positive integer amount.`,
      "invalid-amount"
    );
  }

  return value;
}

/*
|--------------------------------------------------------------------------
| Deterministic Settlement ID
|--------------------------------------------------------------------------
|
| One delivered order creates one settlement.
|
| Example:
|
| order_123
|     ↓
| order_123
|
| The collection name already identifies the document as a settlement,
| so the order ID itself is sufficient and easy to reconcile.
|
*/

export function createSettlementDocumentId(
  orderIdInput: string
): string {
  return requireIdentifier(
    orderIdInput,
    "Order ID"
  );
}

/*
|--------------------------------------------------------------------------
| Create Settlement
|--------------------------------------------------------------------------
*/

export async function createSettlement(
  input:
    CreatePaymentSettlementInput
): Promise<
  CreatePaymentSettlementResult
> {
  const orderId =
    requireIdentifier(
      input.orderId,
      "Order ID"
    );

  const storeId =
    requireIdentifier(
      input.storeId,
      "Store ID"
    );

  const driverId =
    requireIdentifier(
      input.driverId,
      "Driver ID"
    );

  const storeAmount =
    requirePositiveCentAmount(
      input.storeAmount,
      "Store settlement amount"
    );

  const driverAmount =
    requirePositiveCentAmount(
      input.driverAmount,
      "Driver settlement amount"
    );

  if (
    input.currency !==
    "usd"
  ) {
    throw new PaymentSettlementServiceError(
      "Only USD settlements are currently supported.",
      "unsupported-currency"
    );
  }

  const settlementId =
    createSettlementDocumentId(
      orderId
    );

  const db =
    getFirestore("default");

  const reference =
    db
      .collection(COLLECTION)
      .doc(settlementId);

  return db.runTransaction(
    async (
      transaction
    ) => {
      const snapshot =
        await transaction.get(
          reference
        );

      if (snapshot.exists) {
        const existing =
          snapshot.data() as
            PaymentSettlement;

        const matches =
          existing.id ===
            settlementId &&
          existing.orderId ===
            orderId &&
          existing.storeId ===
            storeId &&
          existing.driverId ===
            driverId &&
          existing.storeAmount ===
            storeAmount &&
          existing.driverAmount ===
            driverAmount &&
          existing.currency ===
            input.currency;

        if (!matches) {
          throw new PaymentSettlementServiceError(
            "An existing settlement conflicts with the calculated financial obligation.",
            "settlement-conflict"
          );
        }

        return {
          settlementId,

          created:
            false,

          settlement:
            existing,
        };
      }

      const settlement:
        PaymentSettlement = {
          id:
            settlementId,

          orderId,

          storeId,

          driverId,

          storeAmount,

          driverAmount,

          currency:
            "usd",

          status:
            "eligible",

          createdAt:
            new Date()
              .toISOString(),
        };

      transaction.create(
        reference,
        settlement
      );

      return {
        settlementId,

        created:
          true,

        settlement,
      };
    }
  );
}

/*
|--------------------------------------------------------------------------
| Read Settlement
|--------------------------------------------------------------------------
*/

export async function getSettlement(
  settlementIdInput: string
): Promise<
  PaymentSettlement | null
> {
  const settlementId =
    requireIdentifier(
      settlementIdInput,
      "Settlement ID"
    );

  const document =
    await getFirestore("default")
      .collection(COLLECTION)
      .doc(settlementId)
      .get();

  if (!document.exists) {
    return null;
  }

  return document.data() as
    PaymentSettlement;
}

/*
|--------------------------------------------------------------------------
| State Update
|--------------------------------------------------------------------------
*/

async function updateSettlementStatus(
  settlementIdInput: string,
  status:
    PaymentSettlementStatus,
  additionalFields:
    Record<string, unknown> = {}
): Promise<void> {
  const settlementId =
    requireIdentifier(
      settlementIdInput,
      "Settlement ID"
    );

  await getFirestore("default")
    .collection(COLLECTION)
    .doc(settlementId)
    .update({
      status,

      ...additionalFields,

      updatedAt:
        new Date()
          .toISOString(),
    });
}

/*
|--------------------------------------------------------------------------
| Lifecycle Methods
|--------------------------------------------------------------------------
*/

export async function markSettlementEligible(
  settlementId: string
): Promise<void> {
  await updateSettlementStatus(
    settlementId,
    "eligible"
  );
}

export async function markSettlementProcessing(
  settlementId: string
): Promise<void> {
  await updateSettlementStatus(
    settlementId,
    "processing"
  );
}

export async function markSettlementCompleted(
  settlementId: string
): Promise<void> {
  await updateSettlementStatus(
    settlementId,
    "completed",
    {
      completedAt:
        new Date()
          .toISOString(),

      failedAt:
        FieldValue.delete(),

      lastError:
        FieldValue.delete(),
    }
  );
}

export async function markSettlementFailed(
  settlementId: string,
  errorMessage?: string
): Promise<void> {
  const normalizedError =
    errorMessage?.trim() ||
    "The marketplace settlement failed.";

  await updateSettlementStatus(
    settlementId,
    "failed",
    {
      failedAt:
        new Date()
          .toISOString(),

      lastError:
        normalizedError,
    }
  );
}
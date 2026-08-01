/*
|--------------------------------------------------------------------------
| Marketplace Payment Ledger Service
|--------------------------------------------------------------------------
|
| Stores immutable financial events for LIA marketplace orders.
|
| Ledger entries are never edited after creation.
|
| Important safety rule:
|
| Financial workflow retries must not create duplicate ledger events.
|
| Callers may therefore provide a deterministic event key such as:
|
| allocation_created
| settlement_created
| store_transfer_created
| store_transfer_completed
|
| The resulting document ID combines:
|
| order ID + event key
|
| Existing matching entries are reused.
| Conflicting entries are rejected.
|
*/

import {
  getFirestore,
} from "firebase-admin/firestore";

import type {
  PaymentLedgerEntry,
  PaymentLedgerEventType,
} from "./paymentLedgerTypes";

/*
|--------------------------------------------------------------------------
| Constants
|--------------------------------------------------------------------------
*/

const COLLECTION =
  "paymentLedger";

/*
|--------------------------------------------------------------------------
| Input
|--------------------------------------------------------------------------
*/

export interface CreateLedgerEntryInput {
  orderId: string;

  event:
    PaymentLedgerEventType;

  amount: number;

  description: string;

  metadata?:
    Record<string, unknown>;

  /*
   * Stable event identity within one order.
   *
   * Examples:
   *
   * allocation_created
   * settlement_created
   * store_transfer_created
   * driver_transfer_completed
   *
   * When omitted, the service creates a new append-only event with a
   * generated Firestore ID.
   */
  eventKey?: string;
}

/*
|--------------------------------------------------------------------------
| Result
|--------------------------------------------------------------------------
*/

export interface CreateLedgerEntryResult {
  ledgerEntryId: string;

  created: boolean;
}

/*
|--------------------------------------------------------------------------
| Errors
|--------------------------------------------------------------------------
*/

export class PaymentLedgerServiceError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);

    this.name =
      "PaymentLedgerServiceError";
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
    throw new PaymentLedgerServiceError(
      `${fieldName} is required.`,
      "invalid-argument"
    );
  }

  if (
    normalized.includes("/") ||
    normalized.includes("\\")
  ) {
    throw new PaymentLedgerServiceError(
      `${fieldName} contains invalid characters.`,
      "invalid-argument"
    );
  }

  return normalized;
}

function requireNonNegativeInteger(
  value: number,
  fieldName: string
): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new PaymentLedgerServiceError(
      `${fieldName} must be a non-negative integer amount.`,
      "invalid-amount"
    );
  }

  return value;
}

function requireDescription(
  value: string
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new PaymentLedgerServiceError(
      "Ledger description is required.",
      "invalid-description"
    );
  }

  return normalized;
}

/*
|--------------------------------------------------------------------------
| Deterministic Ledger ID
|--------------------------------------------------------------------------
*/

export function createLedgerDocumentId(
  orderIdInput: string,
  eventKeyInput: string
): string {
  const orderId =
    requireIdentifier(
      orderIdInput,
      "Order ID"
    );

  const eventKey =
    requireIdentifier(
      eventKeyInput,
      "Ledger event key"
    );

  return `${orderId}_${eventKey}`;
}

/*
|--------------------------------------------------------------------------
| Create Ledger Entry
|--------------------------------------------------------------------------
*/

export async function createLedgerEntry(
  input:
    CreateLedgerEntryInput
): Promise<
  CreateLedgerEntryResult
> {
  const orderId =
    requireIdentifier(
      input.orderId,
      "Order ID"
    );

  const amount =
    requireNonNegativeInteger(
      input.amount,
      "Ledger amount"
    );

  const description =
    requireDescription(
      input.description
    );

  const db =
    getFirestore("default");

  /*
   * Events without an event key remain append-only operational records.
   *
   * Deterministic keys should be used for financial milestones that may be
   * reached again during retries.
   */
  if (!input.eventKey) {
    const reference =
      db
        .collection(COLLECTION)
        .doc();

    const entry:
      PaymentLedgerEntry = {
        id:
          reference.id,

        orderId,

        event:
          input.event,

        description,

        amount,

        currency:
          "usd",

        createdAt:
          new Date()
            .toISOString(),

        ...(input.metadata
          ? {
              metadata:
                input.metadata,
            }
          : {}),
      };

    await reference.set(
      entry
    );

    return {
      ledgerEntryId:
        reference.id,

      created:
        true,
    };
  }

  const eventKey =
    requireIdentifier(
      input.eventKey,
      "Ledger event key"
    );

  const ledgerEntryId =
    createLedgerDocumentId(
      orderId,
      eventKey
    );

  const reference =
    db
      .collection(COLLECTION)
      .doc(ledgerEntryId);

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
            PaymentLedgerEntry;

        /*
         * One deterministic ledger identity must always describe the same
         * financial event.
         */
        const matches =
          existing.id ===
            ledgerEntryId &&
          existing.orderId ===
            orderId &&
          existing.event ===
            input.event &&
          existing.amount ===
            amount &&
          existing.currency ===
            "usd" &&
          existing.description ===
            description;

        if (!matches) {
          throw new PaymentLedgerServiceError(
            "An existing ledger entry conflicts with the requested financial event.",
            "ledger-conflict"
          );
        }

        return {
          ledgerEntryId,

          created:
            false,
        };
      }

      const entry:
        PaymentLedgerEntry = {
        id:
          ledgerEntryId,

        orderId,

        event:
          input.event,

        description,

        amount,

        currency:
          "usd",

        createdAt:
          new Date()
            .toISOString(),

        ...(input.metadata
          ? {
              metadata:
                input.metadata,
            }
          : {}),
      };

      transaction.create(
        reference,
        entry
      );

      return {
        ledgerEntryId,

        created:
          true,
      };
    }
  );
}

/*
|--------------------------------------------------------------------------
| Read Order Ledger
|--------------------------------------------------------------------------
*/

export async function getOrderLedger(
  orderIdInput: string
): Promise<
  PaymentLedgerEntry[]
> {
  const orderId =
    requireIdentifier(
      orderIdInput,
      "Order ID"
    );

  const snapshot =
    await getFirestore("default")
      .collection(COLLECTION)
      .where(
        "orderId",
        "==",
        orderId
      )
      .orderBy(
        "createdAt",
        "asc"
      )
      .get();

  return snapshot.docs.map(
    (
      document
    ) =>
      document.data() as
        PaymentLedgerEntry
  );
}
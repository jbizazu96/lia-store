import { getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";

export interface ValidateDeletionRequestInput {
  requestId: string;
}

export interface ValidateDriverDeletionInput {
  driverId: string;
  stripeAccountId: string | null;
  stripe: Stripe;
}

const TERMINAL_ORDER_STATUSES = new Set(["completed", "cancelled"]);
const TERMINAL_TRANSFER_STATUSES = new Set(["completed", "cancelled"]);
const TERMINAL_REFUND_STATUSES = new Set(["completed", "cancelled"]);
const TERMINAL_REVERSAL_STATUSES = new Set(["completed", "not_required"]);
const TERMINAL_DISPUTE_STATUSES = new Set([
  "lost",
  "prevented",
  "warning_closed",
  "won",
]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ?
    value as Record<string, unknown> : {};
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function getDriverOrders(driverId: string) {
  return getFirestore("default")
    .collection("orders")
    .where("delivery.driverId", "==", driverId)
    .get();
}

export class AccountDeletionValidationError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);

    this.name =
      "AccountDeletionValidationError";
  }
}

export const accountDeletionValidationService = {
  async validate(
    input: ValidateDeletionRequestInput
  ): Promise<void> {
    const db =
      getFirestore("default");

    const requestSnapshot =
      await db
        .collection("accountDeletionRequests")
        .doc(input.requestId)
        .get();

    if (!requestSnapshot.exists) {
      throw new AccountDeletionValidationError(
        "Deletion request not found.",
        "not-found"
      );
    }

    const request =
      requestSnapshot.data();

    if (!request) {
      throw new AccountDeletionValidationError(
        "Deletion request is empty.",
        "invalid-request"
      );
    }

    if (
      request.status !== "approved" &&
      request.status !== "scheduled" &&
      request.status !== "processing"
    ) {
      throw new AccountDeletionValidationError(
        "The deletion request is not ready for processing.",
        "invalid-status"
      );
    }

  },

  async validateDriverOperations(driverId: string): Promise<void> {
    const orders = await getDriverOrders(driverId);

    if (orders.docs.some((document) => {
      const order = document.data();
      return !TERMINAL_ORDER_STATUSES.has(text(order.status));
    })) {
      throw new AccountDeletionValidationError(
        "Driver deletion is blocked while an assigned order is active.",
        "driver-has-active-orders"
      );
    }

    if (orders.docs.some((document) => document.data().shipday?.active === true)) {
      throw new AccountDeletionValidationError(
        "Driver deletion is blocked while a Shipday delivery is active.",
        "driver-has-active-deliveries"
      );
    }

    if (orders.docs.some((document) =>
      document.data().liaInvestigation?.active === true
    )) {
      throw new AccountDeletionValidationError(
        "Driver deletion is blocked by an active order investigation.",
        "driver-has-active-investigation"
      );
    }
  },

  async validateDriverFinancials(
    input: ValidateDriverDeletionInput
  ): Promise<void> {
    const db = getFirestore("default");
    const [orders, settlements, transfers] = await Promise.all([
      getDriverOrders(input.driverId),
      db.collection("paymentSettlements")
        .where("driverId", "==", input.driverId)
        .get(),
      db.collection("paymentTransfers")
        .where("recipient.id", "==", input.driverId)
        .get(),
    ]);

    if (settlements.docs.some((document) =>
      text(document.data().status) !== "completed"
    )) {
      throw new AccountDeletionValidationError(
        "Driver deletion is blocked while a settlement is unresolved.",
        "driver-has-processing-settlements"
      );
    }

    if (transfers.docs.some((document) => {
      const transfer = document.data();
      return transfer.recipient?.type === "driver" &&
        !TERMINAL_TRANSFER_STATUSES.has(text(transfer.status));
    })) {
      throw new AccountDeletionValidationError(
        "Driver deletion is blocked while a transfer or payout is unresolved.",
        "driver-has-outstanding-payouts"
      );
    }

    const orderIds = orders.docs.map((document) => document.id);
    for (const orderIdChunk of chunks(orderIds, 30)) {
      const refunds = await db.collection("paymentRefunds")
        .where("orderId", "in", orderIdChunk)
        .get();

      if (refunds.docs.some((document) => {
        const refund = document.data();
        const reversals = Array.isArray(refund.reversals) ? refund.reversals : [];
        const hasUnresolvedDriverReversal = reversals.some((value: unknown) => {
          const reversal = record(value);
          return reversal.recipientType === "driver" &&
            reversal.recipientId === input.driverId &&
            !TERMINAL_REVERSAL_STATUSES.has(text(reversal.status));
        });
        return hasUnresolvedDriverReversal ||
          (reversals.some((value: unknown) => {
            const reversal = record(value);
            return reversal.recipientType === "driver" &&
              reversal.recipientId === input.driverId;
          }) && !TERMINAL_REFUND_STATUSES.has(text(refund.status)));
      })) {
        throw new AccountDeletionValidationError(
          "Driver deletion is blocked while a refund or transfer reversal is unresolved.",
          "driver-has-unresolved-refunds"
        );
      }
    }

    if (!input.stripeAccountId) return;

    const requestOptions: Stripe.RequestOptions = {
      stripeAccount: input.stripeAccountId,
    };
    const [balance, disputes] = await Promise.all([
      input.stripe.balance.retrieve({}, requestOptions),
      input.stripe.disputes.list({limit: 100}, requestOptions)
        .autoPagingToArray({limit: 10000}),
    ]);
    const amounts = [...balance.available, ...balance.pending];

    if (amounts.some((entry) => entry.amount < 0)) {
      throw new AccountDeletionValidationError(
        "Driver deletion is blocked by a negative Stripe balance.",
        "driver-has-negative-stripe-balance"
      );
    }

    if (amounts.some((entry) => entry.amount > 0)) {
      throw new AccountDeletionValidationError(
        "Driver deletion is blocked while Stripe funds are available or pending payout.",
        "driver-has-stripe-funds"
      );
    }

    if (disputes.some((dispute) =>
      !TERMINAL_DISPUTE_STATUSES.has(dispute.status)
    )) {
      throw new AccountDeletionValidationError(
        "Driver deletion is blocked by an active Stripe dispute.",
        "driver-has-active-disputes"
      );
    }
  },
};

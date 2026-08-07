/*
|--------------------------------------------------------------------------
| Stripe Processing Fee Service
|--------------------------------------------------------------------------
|
| Stripe's actual processing fee belongs to the platform charge, not the
| marketplace allocation. Record it once in the immutable ledger so LIA
| revenue reporting never relies on a guessed percentage.
|
*/

import Stripe from "stripe";
import {createLedgerEntry} from "../marketplace/paymentLedgerService";

export async function recordStripeProcessingFee(input: {
  stripe: Stripe;
  orderId: string;
  stripeChargeId: string;
}): Promise<void> {
  const charge = await input.stripe.charges.retrieve(
    input.stripeChargeId,
    {expand: ["balance_transaction"]},
  );
  const balanceTransaction = charge.balance_transaction;
  const fee = typeof balanceTransaction === "string"
    ? null
    : balanceTransaction?.fee ?? null;

  /*
   * A succeeded charge normally includes the balance transaction. If Stripe
   * has not made it available yet, do not block the paid order; a later
   * reconciliation can safely fill this missing ledger event.
   */
  if (!Number.isSafeInteger(fee) || fee === null || fee < 0) {
    throw new Error("Stripe has not supplied a processing fee for this charge yet.");
  }

  await createLedgerEntry({
    orderId: input.orderId,
    event: "stripe_processing_fee_recorded",
    eventKey: "stripe_processing_fee_recorded",
    amount: fee,
    description: "Stripe processing fee recorded from the customer charge.",
    metadata: {
      stripeChargeId: charge.id,
      balanceTransactionId: typeof balanceTransaction === "string"
        ? balanceTransaction
        : balanceTransaction?.id ?? null,
    },
  });
}

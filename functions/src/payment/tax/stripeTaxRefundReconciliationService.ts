import Stripe from "stripe";

export interface StripeTaxRefundReconciliation {
  status: "pending" | "committed" | "failed";
  calculationId: string;
  originalTransactionId?: string;
  reversalTransactionId?: string;
  error?: string;
}

export function resolveStripeTaxRefundAssociation(
  association: Stripe.Tax.Association,
  paymentIntentId: string,
  stripeRefundId: string
): StripeTaxRefundReconciliation {
  const attempts = association.tax_transaction_attempts ?? [];
  const original = attempts.find((attempt) => attempt.source === paymentIntentId);
  const reversal = attempts.find((attempt) => attempt.source === stripeRefundId);
  const originalTransactionId = original?.committed?.transaction;

  if (reversal?.status === "errored") {
    return {
      status: "failed",
      calculationId: association.calculation,
      ...(originalTransactionId ? {originalTransactionId} : {}),
      error: reversal.errored?.reason ?? "Stripe could not commit the tax reversal.",
    };
  }

  if (reversal?.status === "committed" && reversal.committed?.transaction) {
    return {
      status: "committed",
      calculationId: association.calculation,
      ...(originalTransactionId ? {originalTransactionId} : {}),
      reversalTransactionId: reversal.committed.transaction,
    };
  }

  return {
    status: "pending",
    calculationId: association.calculation,
    ...(originalTransactionId ? {originalTransactionId} : {}),
  };
}

export async function reconcileStripeTaxRefund(
  stripe: Stripe,
  input: {paymentIntentId: string; stripeRefundId: string}
): Promise<StripeTaxRefundReconciliation> {
  const association = await stripe.tax.associations.find({
    payment_intent: input.paymentIntentId,
  });
  return resolveStripeTaxRefundAssociation(
    association,
    input.paymentIntentId,
    input.stripeRefundId
  );
}


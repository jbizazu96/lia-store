import {describe, expect, it} from "vitest";
import type Stripe from "stripe";

import {resolveStripeTaxRefundAssociation} from "../../functions/src/payment/tax/stripeTaxRefundReconciliationService";

function association(attempts: Array<Record<string, unknown>>): Stripe.Tax.Association {
  return {
    id: "taxa_test",
    object: "tax.association",
    calculation: "taxcalc_test",
    payment_intent: "pi_test",
    tax_transaction_attempts: attempts,
  } as Stripe.Tax.Association;
}

describe("automatic Stripe Tax refund reversals", () => {
  it.each(["full", "partial"])("records the committed %s refund reversal", (scope) => {
    const result = resolveStripeTaxRefundAssociation(
      association([
        {source: "pi_test", status: "committed", committed: {transaction: "tax_sale"}},
        {source: `re_${scope}`, status: "committed", committed: {transaction: `tax_reversal_${scope}`}},
      ]),
      "pi_test",
      `re_${scope}`
    );
    expect(result).toEqual({
      status: "committed",
      calculationId: "taxcalc_test",
      originalTransactionId: "tax_sale",
      reversalTransactionId: `tax_reversal_${scope}`,
    });
  });

  it("keeps the refund pending while Stripe is still creating the association", () => {
    expect(resolveStripeTaxRefundAssociation(
      association([{source: "pi_test", status: "committed", committed: {transaction: "tax_sale"}}]),
      "pi_test",
      "re_pending"
    )).toMatchObject({status: "pending", originalTransactionId: "tax_sale"});
  });
});


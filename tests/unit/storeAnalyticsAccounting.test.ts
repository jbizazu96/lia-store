import {describe, expect, it} from "vitest";
import {calculateStoreAnalyticsAccounting} from "../../functions/src/reporting/storeAnalyticsAccounting";

describe("store analytics accounting", () => {
  it("separates gross sales, commission, refunds, earnings, and tax exactly in cents", () => {
    const result = calculateStoreAnalyticsAccounting(
      [
        {id: "completed", merchandise: 10_000, tax: 700},
        {id: "open", merchandise: 5_000, tax: 350},
      ],
      new Map([["completed", 9_700]]),
      [{orderId: "completed", merchandise: 2_000, tax: 140, storeReversal: 1_940, total: 2_500, completed: true}],
    );

    expect(result).toEqual({
      grossMerchandise: 15_000,
      salesTax: 1_050,
      grossStoreEntitlement: 9_700,
      storeCommission: 1_000,
      refundedMerchandise: 2_000,
      refundedSalesTax: 140,
      storeRefundImpact: 1_940,
      customerRefundTotal: 2_500,
      refundCount: 1,
    });
  });

  it("does not invent commission or earnings for an unsettled order", () => {
    const result = calculateStoreAnalyticsAccounting(
      [{id: "open", merchandise: 4_000, tax: 280}],
      new Map(),
      [],
    );
    expect(result.grossStoreEntitlement).toBe(0);
    expect(result.storeCommission).toBe(0);
  });

  it("ignores refunds that do not belong to the selected paid-order cohort", () => {
    const result = calculateStoreAnalyticsAccounting(
      [{id: "selected", merchandise: 4_000, tax: 280}],
      new Map([["selected", 3_880]]),
      [{orderId: "outside-period", merchandise: 4_000, tax: 280, storeReversal: 3_880, total: 4_280, completed: true}],
    );
    expect(result.refundedMerchandise).toBe(0);
    expect(result.storeRefundImpact).toBe(0);
  });

  it("deducts a completed store reversal without calling an unfinished customer refund complete", () => {
    const result = calculateStoreAnalyticsAccounting(
      [{id: "order", merchandise: 10_000, tax: 700}],
      new Map([["order", 9_700]]),
      [{orderId: "order", merchandise: 0, tax: 0, storeReversal: 1_940, total: 0, completed: false}],
    );
    expect(result.storeRefundImpact).toBe(1_940);
    expect(result.refundCount).toBe(0);
    expect(result.refundedMerchandise).toBe(0);
  });
});

import {describe, expect, it} from "vitest";
import {
  calculatePaymentRefundAllocation,
  PaymentRefundAllocationError,
} from "../../functions/src/payment/marketplace/paymentRefundAllocationService";

const input = {
  scope: "full" as const,
  originalPayment: {
    merchandiseAmount: 10_000,
    taxAmount: 700,
    deliveryFeeAmount: 1_100,
    serviceFeeAmount: 400,
    driverTipAmount: 500,
    totalAmount: 12_700,
  },
  allocationPolicy: {
    storeCommissionBasisPoints: 1_000,
    driverCommissionBasisPoints: 3_000,
    driverMinimumPayCents: 0,
    freeDeliveryMinimumCents: 10_000,
    freeDeliveryDriverIncentiveWithoutTipCents: 500,
    freeDeliveryDriverIncentiveWithTipCents: 300,
  },
};

describe("marketplace refund allocation", () => {
  it("reverses every destination for a full refund", () => {
    const result = calculatePaymentRefundAllocation(input);
    expect(result).toMatchObject({totalAmount: 12_700, storeReversalAmount: 9_700, driverReversalAmount: 1_270, platformRevenueReductionAmount: 1_730});
  });

  it("supports a component-specific partial refund", () => {
    const result = calculatePaymentRefundAllocation({
      ...input,
      scope: "partial",
      requestedAmounts: {merchandiseAmount: 2_000, taxAmount: 140},
    });
    expect(result.totalAmount).toBe(2_140);
    expect(result.storeReversalAmount).toBe(1_940);
    expect(result.driverReversalAmount).toBe(0);
    expect(result.platformRevenueReductionAmount).toBe(200);
  });

  it("rejects a refund larger than the original component", () => {
    expect(() => calculatePaymentRefundAllocation({
      ...input,
      scope: "partial",
      requestedAmounts: {deliveryFeeAmount: 1_101},
    })).toThrowError(PaymentRefundAllocationError);
  });

  it("rejects inconsistent original payment totals", () => {
    expect(() => calculatePaymentRefundAllocation({
      ...input,
      originalPayment: {...input.originalPayment, totalAmount: 1},
    })).toThrowError(/components do not equal/i);
  });

  it("never creates a driver reversal for a pickup refund", () => {
    const result = calculatePaymentRefundAllocation({
      ...input,
      fulfillmentType: "pickup",
      originalPayment: {
        ...input.originalPayment,
        deliveryFeeAmount: 0,
        driverTipAmount: 0,
        totalAmount: 11_100,
      },
    });
    expect(result.driverReversalAmount).toBe(0);
    expect(result.totalAmount).toBe(11_100);
  });
});

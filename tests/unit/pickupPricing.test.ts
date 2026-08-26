import {describe, expect, it} from "vitest";
import {calculatePaymentPricing} from "../../functions/src/payment/pricing/paymentPricingCalculator";
import type {MarketplacePricingPolicy} from "../../functions/src/payment/pricing/marketplacePricingPolicy";

const policy: MarketplacePricingPolicy = {
  maxRadiusMiles: 25,
  baseDeliveryFeeCents: 599,
  baseDistanceMiles: 3,
  costPerMileCents: 150,
  peakSurchargeEnabled: true,
  peakSurchargeCents: 300,
  freeDeliveryMinimumCents: 10_000,
  defaultMinimumOrderCents: 3_000,
  pickupEnabled: true,
  pickupMaximumDistanceMiles: 30,
  pickupMinimumOrderCents: 1_500,
  pickupPreparationMinutes: 30,
  pickupServiceFeeRate: 0.02,
  pickupMinimumServiceFeeCents: 99,
  pickupMaximumServiceFeeCents: 499,
  serviceFeeRate: 0.05,
  minimumServiceFeeCents: 199,
  maximumServiceFeeCents: 1_099,
  salesTaxRate: 0.07,
  driverMinimumPayCents: 599,
  freeDeliveryDriverIncentiveWithoutTipCents: 500,
  freeDeliveryDriverIncentiveWithTipCents: 300,
};

describe("customer pickup pricing", () => {
  it("removes delivery, peak, and tip while retaining service fee and configured sales tax", () => {
    const result = calculatePaymentPricing({
      policy,
      fulfillmentType: "pickup",
      subtotalAmount: 10_000,
      distanceMiles: 100,
      tipAmount: 2_000,
      isPeakTime: true,
    });

    expect(result).toMatchObject({
      subtotalAmount: 10_000,
      deliveryFeeAmount: 0,
      serviceFeeAmount: 200,
      taxAmount: 700,
      tipAmount: 0,
      totalAmount: 10_900,
      isPeakTime: false,
      peakSurchargeAmount: 0,
    });
  });

  it("uses the pickup-specific service-fee minimum and maximum", () => {
    expect(calculatePaymentPricing({
      policy,
      fulfillmentType: "pickup",
      subtotalAmount: 1_000,
      distanceMiles: 0,
      tipAmount: 0,
    }).serviceFeeAmount).toBe(99);

    expect(calculatePaymentPricing({
      policy,
      fulfillmentType: "pickup",
      subtotalAmount: 100_000,
      distanceMiles: 0,
      tipAmount: 0,
    }).serviceFeeAmount).toBe(499);
  });

  it("does not apply the delivery radius to pickup", () => {
    expect(() => calculatePaymentPricing({
      policy,
      fulfillmentType: "pickup",
      subtotalAmount: 2_000,
      distanceMiles: 1_000,
      tipAmount: 0,
    })).not.toThrow();
  });
});

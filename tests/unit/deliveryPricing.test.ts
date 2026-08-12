import {describe, expect, it} from "vitest";
import {
  calculateDeliveryFee,
  getDeliveryFeeDisplay,
} from "@/services/delivery/deliveryPricing";
import type {MarketplacePricingPolicy} from "@/services/pricing/marketplacePricingClientService";

const policy: MarketplacePricingPolicy = {
  maxRadiusMiles: 25,
  baseDeliveryFeeCents: 600,
  baseDistanceMiles: 5,
  costPerMileCents: 100,
  peakSurchargeEnabled: false,
  peakSurchargeCents: 300,
  freeDeliveryMinimumCents: 10_000,
  defaultMinimumOrderCents: 2_000,
  serviceFeeRate: 0.05,
  minimumServiceFeeCents: 100,
  maximumServiceFeeCents: 500,
  salesTaxRate: 0.07,
  freeDeliveryDriverIncentiveWithoutTipCents: 500,
  freeDeliveryDriverIncentiveWithTipCents: 300,
};

describe("customer delivery pricing", () => {
  it("uses the base delivery fee inside the included distance", () => {
    const result = calculateDeliveryFee(4, 40, policy, false);
    expect(result.deliveryFee).toBe(6);
    expect(result.serviceFee).toBe(2);
    expect(result.totalFees).toBe(8);
  });

  it("adds per-mile and peak pricing to the delivery fee", () => {
    const result = calculateDeliveryFee(9, 40, policy, true);
    expect(result.breakdown.distanceFee).toBe(10);
    expect(result.breakdown.peakSurcharge).toBe(3);
    expect(result.deliveryFee).toBe(13);
  });

  it("caps ordinary routes at the configured maximum distance", () => {
    expect(calculateDeliveryFee(40, 20, policy, false).deliveryFee).toBe(26);
  });

  it("does not cap approved Order Zone routes", () => {
    expect(calculateDeliveryFee(40, 20, policy, false, false).deliveryFee).toBe(41);
  });

  it("waives delivery but retains the service fee at the free-delivery threshold", () => {
    const result = calculateDeliveryFee(12, 100, policy, true);
    expect(result.isFreeDelivery).toBe(true);
    expect(result.deliveryFee).toBe(0);
    expect(result.serviceFee).toBe(5);
    expect(result.breakdown.peakSurcharge).toBe(3);
    expect(getDeliveryFeeDisplay(4, {...policy, baseDeliveryFeeCents: 0})).toBe("Free");
  });

  it("never bills negative distance", () => {
    expect(calculateDeliveryFee(-10, 0, policy, false).deliveryFee).toBe(6);
  });
});

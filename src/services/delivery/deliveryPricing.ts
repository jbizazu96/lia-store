/*
|--------------------------------------------------------------------------
| Delivery Pricing Service
|--------------------------------------------------------------------------
|
| Browser estimates receive their complete policy from the trusted
| marketplace-pricing callable. This module deliberately contains no live
| business pricing defaults.
|
*/

import type {MarketplacePricingPolicy} from "@/services/pricing/marketplacePricingClientService";

export interface DeliveryPricingResult {
  deliveryFee: number;
  serviceFee: number;
  totalFees: number;
  isFreeDelivery: boolean;
  breakdown: {
    baseFee: number;
    distanceFee: number;
    serviceFee: number;
    peakSurcharge: number;
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateDeliveryFee(
  distanceMiles: number,
  subtotal: number,
  policy: MarketplacePricingPolicy,
  isPeakTime = false,
): DeliveryPricingResult {
  const baseFee = policy.baseDeliveryFeeCents / 100;
  const baseDistanceMiles = policy.baseDistanceMiles;
  const perMileRate = policy.costPerMileCents / 100;
  const peakSurcharge = isPeakTime ? policy.peakSurchargeCents / 100 : 0;
  const isFreeDelivery = subtotal >= policy.freeDeliveryMinimumCents / 100;
  const cappedDistance = Math.min(
    Math.max(distanceMiles, 0),
    policy.maxRadiusMiles,
  );
  const distanceFee = roundMoney(
    baseFee + Math.max(cappedDistance - baseDistanceMiles, 0) * perMileRate,
  );
  const serviceFee = roundMoney(Math.max(
    policy.minimumServiceFeeCents / 100,
    Math.min(
      subtotal * policy.serviceFeeRate,
      policy.maximumServiceFeeCents / 100,
    ),
  ));
  const deliveryFee = isFreeDelivery
    ? 0
    : roundMoney(distanceFee + peakSurcharge);

  return {
    deliveryFee,
    serviceFee,
    totalFees: roundMoney(deliveryFee + serviceFee),
    isFreeDelivery,
    breakdown: {baseFee, distanceFee, serviceFee, peakSurcharge},
  };
}

export function getDeliveryFeeDisplay(
  distanceMiles: number,
  policy: MarketplacePricingPolicy,
): string {
  const {deliveryFee} = calculateDeliveryFee(distanceMiles, 0, policy);
  return deliveryFee === 0 ? "Free" : `$${deliveryFee.toFixed(2)}`;
}

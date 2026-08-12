/*
|--------------------------------------------------------------------------
| Marketplace Pricing Policy
|--------------------------------------------------------------------------
|
| The marketplacePayment document is the sole live source of pricing
| policy. A deployment never supplies a customer-facing fee or radius.
|
*/

import {getFirestore} from "firebase-admin/firestore";

export interface MarketplacePricingPolicy {
  maxRadiusMiles: number;
  baseDeliveryFeeCents: number;
  baseDistanceMiles: number;
  costPerMileCents: number;
  peakSurchargeEnabled: boolean;
  peakSurchargeCents: number;
  freeDeliveryMinimumCents: number;
  defaultMinimumOrderCents: number;
  serviceFeeRate: number;
  minimumServiceFeeCents: number;
  maximumServiceFeeCents: number;
  salesTaxRate: number;
  freeDeliveryDriverIncentiveWithoutTipCents: number;
  freeDeliveryDriverIncentiveWithTipCents: number;
}

export const MARKETPLACE_PRICING_POLICY_FIELDS = [
  "maxRadiusMiles",
  "baseDeliveryFeeCents",
  "baseDistanceMiles",
  "costPerMileCents",
  "peakSurchargeCents",
  "freeDeliveryMinimumCents",
  "defaultMinimumOrderCents",
  "serviceFeeRate",
  "minimumServiceFeeCents",
  "maximumServiceFeeCents",
  "salesTaxRate",
  "freeDeliveryDriverIncentiveWithoutTipCents",
  "freeDeliveryDriverIncentiveWithTipCents",
] as const satisfies ReadonlyArray<keyof MarketplacePricingPolicy>;

export function parseMarketplacePricingPolicy(
  input: Record<string, unknown>,
): MarketplacePricingPolicy {
  const policy = {} as MarketplacePricingPolicy;

  for (const field of MARKETPLACE_PRICING_POLICY_FIELDS) {
    const value = input[field];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error("Marketplace pricing policy is incomplete or invalid.");
    }
    policy[field] = value;
  }

  /*
   * Policies created before manual peak activation did not contain a switch.
   * Treating a missing switch as disabled keeps checkout safe until an admin
   * explicitly enables peak pricing for the default policy or a zone.
   */
  policy.peakSurchargeEnabled = input.peakSurchargeEnabled === true;

  const integerFields: Array<keyof MarketplacePricingPolicy> = [
    "maxRadiusMiles", "baseDeliveryFeeCents", "baseDistanceMiles",
    "costPerMileCents", "peakSurchargeCents", "freeDeliveryMinimumCents",
    "defaultMinimumOrderCents", "minimumServiceFeeCents",
    "maximumServiceFeeCents", "freeDeliveryDriverIncentiveWithoutTipCents",
    "freeDeliveryDriverIncentiveWithTipCents",
  ];
  if (integerFields.some((field) => !Number.isInteger(policy[field])) ||
    policy.maxRadiusMiles < 1 ||
    policy.baseDistanceMiles > policy.maxRadiusMiles ||
    policy.minimumServiceFeeCents > policy.maximumServiceFeeCents ||
    policy.serviceFeeRate > 1 ||
    policy.salesTaxRate > 1) {
    throw new Error("Marketplace pricing policy contains unsupported values.");
  }
  return policy;
}

export async function getMarketplacePricingPolicy(): Promise<MarketplacePricingPolicy> {
  const snapshot = await getFirestore("default")
    .collection("settings")
    .doc("marketplacePayment")
    .get();
  return parseMarketplacePricingPolicy(snapshot.data() ?? {});
}

export async function getMarketplacePricingPolicyForZone(
  zoneId: string | null,
): Promise<MarketplacePricingPolicy> {
  if (!zoneId) return getMarketplacePricingPolicy();
  const snapshot = await getFirestore("default").collection("deliveryZones").doc(zoneId).get();
  if (!snapshot.exists || snapshot.data()?.isActive !== true) {
    return getMarketplacePricingPolicy();
  }
  const zoneMaximumRouteMiles = snapshot.data()?.maximumRouteMiles;
  try {
    const policy = parseMarketplacePricingPolicy(
      snapshot.data()?.pricingPolicy && typeof snapshot.data()?.pricingPolicy === "object"
        ? snapshot.data()!.pricingPolicy as Record<string, unknown>
        : {},
    );
    return typeof zoneMaximumRouteMiles === "number"
      ? {...policy, maxRadiusMiles: zoneMaximumRouteMiles}
      : policy;
  } catch {
    const policy = await getMarketplacePricingPolicy();
    return typeof zoneMaximumRouteMiles === "number"
      ? {...policy, maxRadiusMiles: zoneMaximumRouteMiles}
      : policy;
  }
}

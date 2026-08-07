import {httpsCallable} from "firebase/functions";
import {functions} from "@/lib/firebase";

export interface MarketplacePricingPolicy {
  maxRadiusMiles: number; baseDeliveryFeeCents: number; baseDistanceMiles: number; costPerMileCents: number; peakSurchargeCents: number;
  freeDeliveryMinimumCents: number; defaultMinimumOrderCents: number; serviceFeeRate: number; minimumServiceFeeCents: number; maximumServiceFeeCents: number; salesTaxRate: number;
  freeDeliveryDriverIncentiveWithoutTipCents: number; freeDeliveryDriverIncentiveWithTipCents: number;
}
export const marketplacePricingClientService = {
  getPolicy: async (): Promise<MarketplacePricingPolicy> => {
    const result = await httpsCallable<unknown, {policy: MarketplacePricingPolicy}>(functions, "getMarketplacePricing")();
    return result.data.policy;
  },
};

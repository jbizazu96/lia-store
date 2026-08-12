import {httpsCallable} from "firebase/functions";
import {functions} from "@/lib/firebase";

export interface MarketplacePricingPolicy {
  maxRadiusMiles: number; baseDeliveryFeeCents: number; baseDistanceMiles: number; costPerMileCents: number; peakSurchargeEnabled: boolean; peakSurchargeCents: number;
  freeDeliveryMinimumCents: number; defaultMinimumOrderCents: number; serviceFeeRate: number; minimumServiceFeeCents: number; maximumServiceFeeCents: number; salesTaxRate: number;
  freeDeliveryDriverIncentiveWithoutTipCents: number; freeDeliveryDriverIncentiveWithTipCents: number;
}
export type ZoneAccessType = "same_home_zone" | "store_service_zone" | "customer_order_zone" | "default_pricing";
export interface MarketplacePricingDecision {
  customerHomeZoneId: string | null; storeHomeZoneId: string | null; pricingZoneId: string | null; pricingZoneName: string; zoneAccessType: ZoneAccessType; allowed: boolean;
}
export interface ApplicableMarketplacePricing {policy: MarketplacePricingPolicy; decision: MarketplacePricingDecision | null;}
export const marketplacePricingClientService = {
  getPolicy: async (storeId?: string): Promise<MarketplacePricingPolicy> => {
    const result = await httpsCallable<{storeId?: string}, {policy: MarketplacePricingPolicy}>(functions, "getMarketplacePricing")(storeId ? {storeId} : {});
    return result.data.policy;
  },
  getApplicablePricing: async (storeId: string): Promise<ApplicableMarketplacePricing> => {
    const result = await httpsCallable<{storeId: string}, ApplicableMarketplacePricing & {byStoreId: Record<string, ApplicableMarketplacePricing>}>(functions, "getMarketplacePricing")({storeId});
    return {policy: result.data.policy, decision: result.data.decision};
  },
  getApplicablePricingForStores: async (storeIds: string[]): Promise<Record<string, ApplicableMarketplacePricing>> => {
    if (storeIds.length === 0) return {};
    const result = await httpsCallable<{storeIds: string[]}, {byStoreId: Record<string, ApplicableMarketplacePricing>}>(functions, "getMarketplacePricing")({storeIds});
    return result.data.byStoreId;
  },
};

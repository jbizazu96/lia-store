import {httpsCallable} from "firebase/functions";
import {auth, functions} from "@/lib/firebase";
import {loadCached} from "@/services/cache/clientDataCache";
import type {OrderDeliveryPolicy} from "@/services/delivery/orderDeliveryPolicyClientService";

export interface MarketplacePricingPolicy {
  maxRadiusMiles: number; baseDeliveryFeeCents: number; baseDistanceMiles: number; costPerMileCents: number; peakSurchargeEnabled: boolean; peakSurchargeCents: number;
  freeDeliveryMinimumCents: number; defaultMinimumOrderCents: number; serviceFeeRate: number; minimumServiceFeeCents: number; maximumServiceFeeCents: number; salesTaxRate: number;
  driverMinimumPayCents: number;
  pickupEnabled: boolean; pickupMaximumDistanceMiles: number; pickupMinimumOrderCents: number; pickupPreparationMinutes: number;
  pickupServiceFeeRate: number; pickupMinimumServiceFeeCents: number; pickupMaximumServiceFeeCents: number;
  freeDeliveryDriverIncentiveWithoutTipCents: number; freeDeliveryDriverIncentiveWithTipCents: number;
}
export type ZoneAccessType = "same_home_zone" | "store_service_zone" | "customer_order_zone" | "default_pricing" | "pickup";
export interface MarketplacePricingDecision {
  customerHomeZoneId: string | null; storeHomeZoneId: string | null; pricingZoneId: string | null; pricingZoneName: string; zoneAccessType: ZoneAccessType; allowed: boolean;
}
export interface ApplicableMarketplacePricing {
  policy: MarketplacePricingPolicy;
  decision: MarketplacePricingDecision | null;
  pickupDecision: MarketplacePricingDecision | null;
  storePickupEnabled: boolean;
}
export interface MarketplacePricingBootstrap {
  policy: MarketplacePricingPolicy;
  byStoreId: Record<string, ApplicableMarketplacePricing>;
  orderDeliveryPolicy: OrderDeliveryPolicy;
}

const MAX_STORES_PER_PRICING_REQUEST = 100;

async function pricingRequest(storeIds: string[]): Promise<MarketplacePricingBootstrap> {
  const normalizedIds = [...new Set(storeIds)].sort();
  const customerCacheKey = auth.currentUser?.uid ?? "anonymous";
  return loadCached(
    `marketplace-pricing:v2:${customerCacheKey}:${normalizedIds.join(",") || "default"}`,
    async () => {
      const callable = httpsCallable<
          {storeIds: string[]},
          MarketplacePricingBootstrap
        >(functions, "getMarketplacePricing");
      const batches: string[][] = [];
      if (normalizedIds.length === 0) batches.push([]);
      for (let start = 0; start < normalizedIds.length; start += MAX_STORES_PER_PRICING_REQUEST) {
        batches.push(normalizedIds.slice(start, start + MAX_STORES_PER_PRICING_REQUEST));
      }
      const responses = await Promise.all(
        batches.map((batch) => callable({storeIds: batch})),
      );
      const first = responses[0].data;
      return {
        policy: first.policy,
        orderDeliveryPolicy: first.orderDeliveryPolicy,
        byStoreId: Object.assign({}, ...responses.map((response) => response.data.byStoreId)),
      };
    },
    {ttlMs: 30_000},
  );
}

export const marketplacePricingClientService = {
  getPolicy: async (storeId?: string): Promise<MarketplacePricingPolicy> => {
    return (await pricingRequest(storeId ? [storeId] : [])).policy;
  },
  getApplicablePricing: async (storeId: string): Promise<ApplicableMarketplacePricing> => {
    const result = await pricingRequest([storeId]);
    return result.byStoreId[storeId] ?? {
      policy: result.policy,
      decision: null,
      pickupDecision: null,
      storePickupEnabled: false,
    };
  },
  getApplicablePricingForStores: async (storeIds: string[]): Promise<Record<string, ApplicableMarketplacePricing>> => {
    if (storeIds.length === 0) return {};
    return (await pricingRequest(storeIds)).byStoreId;
  },
  getHomeBootstrap: pricingRequest,
  getOrderDeliveryPolicy: async (storeId?: string): Promise<OrderDeliveryPolicy> =>
    (await pricingRequest(storeId ? [storeId] : [])).orderDeliveryPolicy,
};

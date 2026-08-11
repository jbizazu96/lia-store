"use client";
import {useEffect, useState} from "react";
import {marketplacePricingClientService, type ApplicableMarketplacePricing, type MarketplacePricingPolicy} from "@/services/pricing/marketplacePricingClientService";

export function useMarketplacePricingPolicy(storeId?: string) {
  const requestKey = storeId ?? "default";
  const [result, setResult] = useState<{key: string; policy: MarketplacePricingPolicy} | null>(null);
  useEffect(() => { let active = true; void marketplacePricingClientService.getPolicy(storeId).then((policy) => {if (active) setResult({key: requestKey, policy});}).catch(() => {}); return () => {active = false;}; }, [requestKey, storeId]);
  return result?.key === requestKey ? result.policy : null;
}

export function useApplicableMarketplacePricing(storeId?: string) {
  const [result, setResult] = useState<{storeId: string; value: ApplicableMarketplacePricing} | null>(null);
  useEffect(() => { if (!storeId) return; let active = true; void marketplacePricingClientService.getApplicablePricing(storeId).then((value) => {if (active) setResult({storeId, value});}).catch(() => {}); return () => {active = false;}; }, [storeId]);
  return storeId && result?.storeId === storeId ? result.value : null;
}

"use client";
import {useEffect, useState} from "react";
import {marketplacePricingClientService, type MarketplacePricingPolicy} from "@/services/pricing/marketplacePricingClientService";

export function useMarketplacePricingPolicy() {
  const [policy, setPolicy] = useState<MarketplacePricingPolicy | null>(null);
  useEffect(() => { let active = true; void marketplacePricingClientService.getPolicy().then((value) => {if (active) setPolicy(value);}).catch(() => {}); return () => {active = false;}; }, []);
  return policy;
}

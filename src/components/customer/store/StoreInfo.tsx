"use client";

/*
  Store information section.
  Uses consistent distance, delivery fee, and time formatting.
  ✅ Checks store schedule to determine if open/closed
  ✅ Shows "No schedule" when schedule is not set
*/

import {
  getStoreStatus,
} from "@/services/store/storeSchedule";
import {useState} from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {ChevronRight, Star} from "lucide-react";
import {
  formatDistance,
  getEstimatedTime,
} from "@/services/delivery/distance";
import {useMarketplacePricingPolicy} from "@/hooks/useMarketplacePricingPolicy";
import {useOrderDeliveryPolicy} from "@/hooks/useOrderDeliveryPolicy";
import {PricingFeesModal} from "./PricingFeesModal";
import type {StoreImageVariants} from "@/types/store";

interface ScheduleDay {
  day: string;
  open: string;
  close: string;
  isClosed: boolean;
}

interface StoreInfoProps {
  name: string;
  address: string;
  logoUrl: string;
  logoImageVariants?: StoreImageVariants;
  isOpen: boolean;
  distance: number;
  deliveryFee: number;
  estimatedPrepTime: number;
  rating: number;
  reviewCount: number;
  schedule?: ScheduleDay[];

  onViewMore: () => void;
}

export function StoreInfo({
  name,
  address,
  logoUrl,
  logoImageVariants,
  isOpen: fallbackIsOpen,
  distance,
  deliveryFee,
  estimatedPrepTime,
  rating,
  reviewCount,
  schedule,
  onViewMore,
}: StoreInfoProps) {
  const marketplacePolicy = useMarketplacePricingPolicy();
  const orderDeliveryPolicy = useOrderDeliveryPolicy();
  const [showPricingFees, setShowPricingFees] = useState(false);
  // Use the shared formatting functions
  const formattedDistance = formatDistance(distance);
  
  const isWithinDeliveryRadius =
    distance <= (marketplacePolicy?.maxRadiusMiles ?? Infinity);

  const displayedMinimumOrder =
    (marketplacePolicy?.defaultMinimumOrderCents ?? 0) / 100;

  // Get delivery fee from the service (uses the same logic as home page)
  const deliveryFeeDisplay = `$${deliveryFee.toFixed(2)}`;
  
  // Get estimated time from the service
  const formattedTime = getEstimatedTime(distance || estimatedPrepTime / 2, orderDeliveryPolicy);


      const status = getStoreStatus(
          schedule,
          fallbackIsOpen
        );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative z-10 mx-auto max-w-2xl px-5 pb-1 pt-5"
    >
      <div className="flex items-center gap-3">
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-slate-100 bg-white shadow-sm">
          {logoUrl ? (
            <Image
              src={logoImageVariants?.small || logoImageVariants?.medium || logoUrl}
              alt={`${name} logo`}
              fill
              sizes="44px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-orange-50 text-lg font-black text-orange-600">
              {name.charAt(0)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-black tracking-[-0.015em] text-slate-950">{name}</h1>
          {reviewCount > 0 && (
            <div className="mt-0.5 flex items-center gap-1.5">
              <div className="flex items-center gap-0.5">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <span className="text-xs font-bold text-gray-700">{rating.toFixed(1)}</span>
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onViewMore}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-900 transition hover:bg-slate-200"
          aria-label="View store information"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <button
        type="button"
        onClick={onViewMore}
        className="mt-4 block max-w-full text-left text-xs font-medium text-slate-600"
      >
        <span>{formattedDistance}</span>
        {address && <><span> · </span><span>{address}</span></>}
      </button>

      <div className="mt-1.5 flex items-end justify-between gap-4">
        <div className="space-y-1 text-xs font-medium text-slate-600">
          <p>{formattedTime}</p>
          <p>{isWithinDeliveryRadius ? `${deliveryFeeDisplay} delivery fee` : "Delivery unavailable"}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowPricingFees(true)}
          className="shrink-0 text-xs font-semibold text-slate-600 underline decoration-1 underline-offset-4 transition hover:text-orange-600"
        >
          Pricing &amp; Fees
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ${status.isOpen ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
          <span className={`h-2 w-2 rounded-full ${status.statusColor}`} />
          {status.statusText}{status.message ? ` · ${status.message}` : ""}
        </span>
        <span>Minimum order ${displayedMinimumOrder.toFixed(2)}</span>
      </div>

      <PricingFeesModal
        open={showPricingFees}
        onClose={() => setShowPricingFees(false)}
        deliveryFee={deliveryFee}
        policy={marketplacePolicy}
      />
    </motion.div>
  );
}

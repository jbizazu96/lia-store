"use client";

import {useEffect} from "react";
import {ShoppingBag, Truck} from "lucide-react";
import {
  useApplicableMarketplacePricing,
  useMarketplacePricingPolicy,
} from "@/hooks/useMarketplacePricingPolicy";
import type {FulfillmentType} from "@/types/fulfillment";
import {isPickupLocationAllowed} from "@/services/pricing/pickupAvailability";

interface CustomerFulfillmentSelectorProps {
  fulfillmentType: FulfillmentType;
  onChange: (value: FulfillmentType) => void;
  storeId: string;
  storePickupEnabled: boolean;
  distanceMiles: number | null;
  deliveryAvailable: boolean;
  compact?: boolean;
}

export function CustomerFulfillmentSelector({
  fulfillmentType,
  onChange,
  storeId,
  storePickupEnabled,
  distanceMiles,
  deliveryAvailable,
  compact = false,
}: CustomerFulfillmentSelectorProps) {
  const policy = useMarketplacePricingPolicy();
  const applicablePricing = useApplicableMarketplacePricing(storeId);
  const effectiveStorePickupEnabled =
    applicablePricing?.storePickupEnabled ?? storePickupEnabled;
  const pickupAvailable =
    policy?.pickupEnabled === true &&
    effectiveStorePickupEnabled &&
    isPickupLocationAllowed(
      policy,
      applicablePricing?.pickupDecision?.allowed === true,
      distanceMiles,
    );

  useEffect(() => {
    if (
      fulfillmentType === "delivery" &&
      !deliveryAvailable &&
      pickupAvailable
    ) {
      onChange("pickup");
      return;
    }
    if (
      fulfillmentType === "pickup" &&
      applicablePricing &&
      !pickupAvailable
    ) {
      onChange("delivery");
    }
  }, [applicablePricing, deliveryAvailable, fulfillmentType, onChange, pickupAvailable]);

  if (!pickupAvailable) return null;

  return (
    <section className={compact ? "my-3" : "mx-auto mt-4 max-w-2xl px-4"} aria-label="Fulfillment method">
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
        <button
          type="button"
          aria-pressed={fulfillmentType === "delivery"}
          onClick={() => onChange("delivery")}
          disabled={!deliveryAvailable}
          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${fulfillmentType === "delivery" ? "bg-white text-orange-700 shadow-sm" : "text-slate-500"}`}
        >
          <Truck className="h-4 w-4" /> Delivery
        </button>
        <button
          type="button"
          aria-pressed={fulfillmentType === "pickup"}
          onClick={() => onChange("pickup")}
          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition ${fulfillmentType === "pickup" ? "bg-white text-orange-700 shadow-sm" : "text-slate-500"}`}
        >
          <ShoppingBag className="h-4 w-4" /> Pickup
        </button>
      </div>
      {fulfillmentType === "pickup" && (
        <p className="mt-2 text-center text-xs font-medium text-slate-500">
          {deliveryAvailable
            ? `Pickup has no delivery fee. Outside your approved zones, it is available up to ${policy?.pickupMaximumDistanceMiles ?? 0} driving miles.`
            : "This store is outside your delivery access. Only customer pickup is available for this order."}
        </p>
      )}
    </section>
  );
}

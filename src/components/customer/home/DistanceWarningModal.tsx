"use client";

import {motion} from "framer-motion";
import {AlertCircle, MapPin, Truck, X} from "lucide-react";
import {useRouter} from "next/navigation";
import {formatDistance} from "@/services/delivery/distance";
import {useMarketplacePricingPolicy} from "@/hooks/useMarketplacePricingPolicy";

interface DistanceWarningModalProps {
  storeId: string;
  storeCity: string;
  distance: number;
  zoneAccessAllowed: boolean;
  pickupAvailable: boolean;
  storePickupEnabled: boolean;
  onClose: () => void;
  onContinue: () => void;
}

export function DistanceWarningModal({storeId, storeCity, distance, zoneAccessAllowed, pickupAvailable, storePickupEnabled, onClose, onContinue}: DistanceWarningModalProps) {
  const router = useRouter();
  const marketplacePolicy = useMarketplacePricingPolicy(storeId);
  const maxRadius = marketplacePolicy?.maxRadiusMiles ?? 25;
  const outsideRadius = distance > maxRadius;
  const requestOrderZone = () => router.push(`/help?request=order-zone&storeId=${encodeURIComponent(storeId)}&storeCity=${encodeURIComponent(storeCity)}`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <motion.div initial={{opacity: 0, scale: 0.96}} animate={{opacity: 1, scale: 1}} exit={{opacity: 0, scale: 0.96}} className="relative max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-6">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100" aria-label="Close"><X className="h-5 w-5 text-gray-500" /></button>
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100"><AlertCircle className="h-8 w-8 text-orange-600" /></div>
        <h2 className="mb-2 text-center text-xl font-bold text-gray-900">{pickupAvailable ? "This store is available for pickup only" : "Ordering isn’t available from this store yet"}</h2>
        <p className="text-center text-sm leading-6 text-gray-600">
          {pickupAvailable
            ? "This store is outside your available delivery zone or delivery distance. You may place a pickup order and collect it from the store."
            : outsideRadius
            ? `This store is ${formatDistance(distance)} away, beyond the normal ${maxRadius}-mile delivery limit.`
            : !zoneAccessAllowed
              ? "This store is not in your home zone or one of your approved Order Zones."
              : "This store is currently outside your available delivery area."}
        </p>
        <div className="my-5 rounded-2xl bg-gray-50 p-4 text-sm">
          <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-gray-600"><MapPin className="h-4 w-4" />Distance</span><strong>{formatDistance(distance)}</strong></div>
          <div className="mt-2 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-gray-600"><Truck className="h-4 w-4" />Order status</span><strong className="text-orange-700">{pickupAvailable ? "Pickup only" : "Browsing only"}</strong></div>
        </div>
        <p className="mb-5 text-center text-xs leading-5 text-gray-500">{pickupAvailable ? `Delivery is unavailable, but this store is within the ${marketplacePolicy?.pickupMaximumDistanceMiles ?? 0}-mile pickup threshold.` : storePickupEnabled ? `This store is outside your delivery access and beyond the ${marketplacePolicy?.pickupMaximumDistanceMiles ?? 0}-mile pickup threshold. You may still browse its products.` : "This store is not currently accepting customer pickup orders. You may still browse its products."}</p>
        <div className="flex flex-col gap-3">
          {!pickupAvailable && <button type="button" onClick={requestOrderZone} className="w-full rounded-full bg-orange-500 py-3 font-semibold text-white hover:bg-orange-600">Request an Order Zone</button>}
          <button type="button" onClick={onContinue} className={pickupAvailable ? "w-full rounded-full bg-orange-500 py-3 font-semibold text-white hover:bg-orange-600" : "w-full rounded-full border border-gray-200 py-3 font-medium text-gray-700 hover:bg-gray-50"}>{pickupAvailable ? "Continue with pickup" : "Browse store"}</button>
        </div>
      </motion.div>
    </div>
  );
}

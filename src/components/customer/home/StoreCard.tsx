"use client";

/*
  Store card component with proper spacing and padding.
*/

import type { CustomerStore } from "@/types/view-models/customerStore";
import { getStoreStatus } from "@/services/store/storeSchedule";
import {useState} from "react";
import Image from "next/image";
import {motion} from "framer-motion";
import {Heart, Star, MapPin, Truck, Clock, AlertCircle} from "lucide-react";
import { formatDistance } from "@/services/delivery/distance";
import {
  formatStoreName,
} from "@/utils/productDisplay";
import {useMarketplacePricingPolicy} from "@/hooks/useMarketplacePricingPolicy";

interface StoreCardProps {
  store: CustomerStore;
  onClick: () => void;
  onFavoriteChange: (
    storeId: string,
    isFavorite: boolean
  ) => Promise<void>;
}

export function StoreCard({
  store,
  onClick,
  onFavoriteChange,
}: StoreCardProps) {
  const marketplacePolicy = useMarketplacePricingPolicy();
  const [isSavingFavorite, setIsSavingFavorite] = useState(false);
  const maxRadius = marketplacePolicy?.maxRadiusMiles ?? Infinity;
  const distance = store.distance || 0;
  const isTooFar = distance > maxRadius;

  const formattedDistance = formatDistance(distance);
  const deliveryFee = store.deliveryFeeDisplay;
  const estimatedTime = store.estimatedDeliveryTime;
  const displayName =
    formatStoreName(store.name);
  const hasReviews = (store.reviewCount ?? 0) > 0;

  const storeStatus = getStoreStatus(
  store.schedule ?? [],
  store.isOpen ?? false
);

  return (
    <motion.div
      whileTap={{scale: 0.98}}
      onClick={onClick}
      className={`bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition cursor-pointer mb-4 ${
        isTooFar ? "opacity-80" : ""
      }`}
    >
      {/* Store Image */}
      <div className="relative h-48 bg-gray-200">
        {store.bannerUrl || store.logoUrl ? (
          <Image
            src={store.bannerUrl || store.logoUrl || "/placeholder-store.jpg"}
            alt={displayName}
            fill
            sizes="(max-width: 768px) 100vw, 672px"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-orange-100 to-green-100 flex items-center justify-center">
            <span className="text-4xl font-bold text-gray-400">
              {displayName.charAt(0)}
            </span>
          </div>
        )}

        {/* Store Name Overlay */}
        {/*<div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          <div className="max-w-[80%] rounded-xl bg-white/95 px-4 py-2 text-center shadow-md backdrop-blur-sm">
            <h3 className="font-sans text-lg font-extrabold leading-tight tracking-tight text-gray-900">
              {displayName}
            </h3>
          </div>
        </div>*/}

        {/* Favorite Button */}
        <button
          type="button"
          disabled={isSavingFavorite}
          onClick={(e) => {
            e.stopPropagation();
            const nextFavorite = !store.isFavorite;

            setIsSavingFavorite(true);
            void onFavoriteChange(store.id, nextFavorite)
              .catch((error) => {
                console.error("Unable to update saved store:", error);
              })
              .finally(() => {
                setIsSavingFavorite(false);
              });
          }}
          className="absolute top-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 backdrop-blur-sm transition hover:bg-white disabled:cursor-wait disabled:opacity-60"
          aria-label={store.isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart 
            className={`w-5 h-5 transition ${store.isFavorite ? "fill-orange-500 text-orange-500" : "text-gray-600"}`}
          />
        </button>
      
        {/* Status Badges */}
        <div className="absolute top-3 left-3 flex flex-col items-start gap-2">
          <div
            className={`px-3 py-1 rounded-full text-xs font-semibold ${
              storeStatus.isOpen
                ? "bg-green-600 text-white"
                : "bg-red-500 text-white"
            }`}
          >
            {storeStatus.statusText}
          </div>

          {isTooFar && (
            <div className="px-3 py-1.5 bg-orange-500 text-white text-xs font-semibold rounded-full flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              <span>Outside delivery radius</span>
            </div>
          )}
        </div>
        </div>
      {/* Store Info - With more padding */}
      <div className="space-y-2 p-4">
        {/* Store Name & Rating */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {store.logoUrl && (
              <div className="relative w-8 h-8 rounded-full overflow-hidden flex-shrink-0 border border-gray-200">
                <Image
                  src={store.logoUrl}
                  alt={displayName}
                  fill
                  sizes="32px"
                  className="object-cover"
                />
              </div>
            )}
            <h4 className="font-sans text-base font-bold leading-tight tracking-tight text-gray-900">
              {displayName}
            </h4>
          </div>
          
          {hasReviews && (
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span className="text-sm font-medium text-gray-700">
                {(store.rating ?? 0).toFixed(1)}
              </span>
            </div>
          )}
        </div>

        {/* Distance, Delivery Fee & Estimated Time */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-gray-500">
            <MapPin className="w-4 h-4" />
            <span>{formattedDistance}</span>
          </div>
          <div className={`flex items-center gap-1.5 ${
            isTooFar ? "text-red-500" : "text-gray-500"
          }`}>
            <Truck className="w-4 h-4" />
            <span>
              {isTooFar ? "Delivery unavailable" : `Delivery: ${deliveryFee}`}
            </span>
          </div>
          {!isTooFar && (
            <div className="flex items-center gap-1.5 text-gray-500">
              <Clock className="w-4 h-4" />
              <span>{estimatedTime}</span>
            </div>
          )}
        </div>

        {/* Location */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-sm text-gray-400">
            <span>Location: {store.city}, {store.state}</span>
          </div>
          {isTooFar && (
            <span className="text-xs text-orange-500 font-medium">
              Outside delivery radius
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm">
          <div
            className={`w-2 h-2 rounded-full ${storeStatus.statusColor}`}
          />

          <span
            className={`font-medium ${storeStatus.textColor}`}
          >
            {storeStatus.statusText}
          </span>

          {storeStatus.message && (
            <span className="text-gray-400">
              • {storeStatus.message}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

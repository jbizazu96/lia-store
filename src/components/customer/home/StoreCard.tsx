"use client";

import type { CustomerStore } from "@/types/view-models/customerStore";
import { getStoreStatus } from "@/services/store/storeSchedule";
import {useState} from "react";
import Image from "next/image";
import {motion} from "framer-motion";
import {Heart, Star, AlertCircle} from "lucide-react";
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
  priority?: boolean;
}

export function StoreCard({
  store,
  onClick,
  onFavoriteChange,
  priority = false,
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
      className={`group cursor-pointer rounded-2xl border border-black/[0.045] bg-white p-2 transition duration-300 hover:border-black/[0.08] ${
        isTooFar ? "opacity-80" : ""
      }`}
    >
      {/* Store Image */}
      <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-gray-50">
        {store.bannerUrl || store.logoUrl ? (
          <Image
            src={store.bannerImageVariants?.medium || store.bannerUrl ||
              store.logoImageVariants?.medium || store.logoUrl || "/placeholder-store.jpg"}
            alt={displayName}
            fill
            sizes="(max-width: 672px) calc(100vw - 32px), 640px"
            className="object-cover transition duration-500 group-hover:scale-[1.03]"
            priority={priority}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-orange-100 to-green-100 flex items-center justify-center">
            <span className="text-4xl font-bold text-gray-400">
              {displayName.charAt(0)}
            </span>
          </div>
        )}

        <div className="absolute left-3 top-3">
          {isTooFar && (
            <div className="px-3 py-1.5 bg-orange-500 text-white text-xs font-semibold rounded-full flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              <span>Outside delivery radius</span>
            </div>
          )}
      </div>
        </div>
      <div className="space-y-1 px-0.5 pt-3">
        {/* Store Name & Rating */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-100 bg-gray-50">
              {store.logoUrl ? (
                <Image
                  src={store.logoImageVariants?.thumbnail || store.logoUrl}
                  alt=""
                  fill
                  sizes="36px"
                  className="object-cover"
                />
              ) : (
                <span className="text-sm font-extrabold text-slate-500">
                  {displayName.charAt(0)}
                </span>
              )}
            </div>
            <h4 className="truncate font-sans text-base font-black leading-tight tracking-[-0.02em] text-slate-950">
              {displayName}
            </h4>
          </div>
          <button
            type="button"
            disabled={isSavingFavorite}
            onClick={(event) => {
              event.stopPropagation();
              setIsSavingFavorite(true);
              void onFavoriteChange(store.id, !store.isFavorite)
                .catch((error) => console.error("Unable to update saved store:", error))
                .finally(() => setIsSavingFavorite(false));
            }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-50 hover:text-orange-600 disabled:opacity-50"
            aria-label={store.isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Heart className={`h-6 w-6 ${store.isFavorite ? "fill-orange-500 text-orange-500" : ""}`} />
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
          {hasReviews && <><span className="font-bold text-slate-900">{(store.rating ?? 0).toFixed(1)}</span><Star className="h-4 w-4 fill-slate-700 text-slate-700" /><span>·</span></>}
          <span>{formattedDistance}</span>
          <span>·</span>
          <span>{estimatedTime}</span>
          {!storeStatus.isOpen && <><span>·</span><span>{storeStatus.statusText}</span></>}
        </div>

        <p className={`text-sm font-medium ${isTooFar ? "text-red-500" : "text-slate-500"}`}>
          {isTooFar ? "Delivery unavailable" : `${deliveryFee} delivery fee`}
        </p>
      </div>
    </motion.div>
  );
}

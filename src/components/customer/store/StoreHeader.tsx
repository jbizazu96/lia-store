"use client";

/*
  Store header with banner, back button, and favorite.
  Logo positioned correctly with proper z-index.
*/

import Image from "next/image";
import {ArrowLeft, Heart} from "lucide-react";
import type {StoreImageVariants} from "@/types/store";

interface StoreHeaderProps {
  bannerUrl: string;
  bannerImageVariants?: StoreImageVariants;
  name: string;
  isFavorite: boolean;
  onBack: () => void;
  onFavoriteChange: () => void;
  favoriteSaving?: boolean;
}

export function StoreHeader({
  bannerUrl,
  bannerImageVariants,
  name,
  isFavorite,
  onBack,
  onFavoriteChange,
  favoriteSaving = false,
}: StoreHeaderProps) {
  return (
    <div className="relative mx-auto max-w-2xl">
      {/* Banner */}
      <div className="relative h-32 w-full overflow-hidden bg-[#f1ece3] sm:h-36">
        {bannerUrl ? (
          <Image
            src={bannerImageVariants?.large || bannerImageVariants?.medium || bannerUrl}
            alt={name}
            fill
            sizes="(max-width: 672px) 100vw, 640px"
            className="object-cover"
            priority
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
            <span className="text-4xl font-bold text-white/50">
              {name.charAt(0)}
            </span>
          </div>
        )}
        
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-black/5" />
      </div>

      {/* Action Buttons */}
      <div className="absolute left-5 right-5 top-5 z-20 flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.15)] transition hover:scale-105"
          aria-label="Go back"
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={2.4} />
        </button>
        <button
          type="button"
          disabled={favoriteSaving}
          onClick={onFavoriteChange}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.15)] transition hover:scale-105 disabled:cursor-wait disabled:opacity-60"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart className={
            "h-6 w-6 transition " +
            (isFavorite
              ? "fill-orange-500 text-orange-500"
              : "text-gray-700 hover:text-orange-500")
          } />
        </button>
      </div>

    </div>
  );
}

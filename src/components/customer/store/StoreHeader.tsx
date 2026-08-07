"use client";

/*
  Store header with banner, back button, and favorite.
  Logo positioned correctly with proper z-index.
*/

import Image from "next/image";
import {X, Heart} from "lucide-react";

interface StoreHeaderProps {
  bannerUrl: string;
  logoUrl: string;
  name: string;
  rating: number;
  reviewCount: number;
  isFavorite: boolean;
  onBack: () => void;
  onFavoriteChange: () => void;
  favoriteSaving?: boolean;
}

export function StoreHeader({
  bannerUrl,
  logoUrl,
  name,
  rating,
  reviewCount,
  isFavorite,
  onBack,
  onFavoriteChange,
  favoriteSaving = false,
}: StoreHeaderProps) {
  return (
    <div className="relative">
      {/* Banner */}
      <div className="relative h-30 w-full bg-gray-200">
        {bannerUrl ? (
          <Image
            src={bannerUrl}
            alt={name}
            fill
            sizes="100vw"
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      </div>

      {/* Action Buttons */}
      <div className="absolute top-4 left-4 right-4 flex justify-between z-20">
        <button
          type="button"
          onClick={onBack}
          className="w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white transition shadow-lg"
          aria-label="Go back"
        >
          <X className="w-5 h-5 text-gray-700" />
        </button>
        <button
          type="button"
          disabled={favoriteSaving}
          onClick={onFavoriteChange}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-lg backdrop-blur-sm transition hover:bg-white disabled:cursor-wait disabled:opacity-60"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart className={
            "h-5 w-5 transition " +
            (isFavorite
              ? "fill-orange-500 text-orange-500"
              : "text-gray-700 hover:text-orange-500")
          } />
        </button>
      </div>

      {/* Logo - Positioned to overlap the banner and info card */}
      <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 z-20">
        <div className="relative w-20 h-20 rounded-full bg-white p-1 shadow-lg">
          <div className="relative w-full h-full rounded-full overflow-hidden">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={name}
                fill
                sizes="80px"
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
                <span className="text-2xl font-bold text-white">
                  {name.charAt(0)}
                </span>
              </div>
            )}
          </div>
          {/* Green ring */}
          <div className="absolute inset-0 rounded-full border-4 border-orange-500 pointer-events-none" />
        </div>
      </div>
    </div>
  );
}

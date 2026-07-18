"use client";

/*
  Store header with banner, back button, and favorite.
  Logo positioned correctly with proper z-index.
*/

import Image from "next/image";
import {motion} from "framer-motion";
import {X, Heart, Star} from "lucide-react";

interface StoreHeaderProps {
  bannerUrl: string;
  logoUrl: string;
  name: string;
  rating: number;
  reviewCount: number;
  onBack: () => void;
}

export function StoreHeader({
  bannerUrl,
  logoUrl,
  name,
  rating,
  reviewCount,
  onBack,
}: StoreHeaderProps) {
  return (
    <div className="relative">
      {/* Banner */}
      <div className="relative h-48 w-full bg-gray-200">
        {bannerUrl ? (
          <Image
            src={bannerUrl}
            alt={name}
            fill
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
          className="w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white transition shadow-lg"
          aria-label="Add to favorites"
        >
          <Heart className="w-5 h-5 text-gray-700 hover:text-red-500 transition" />
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
          <div className="absolute inset-0 rounded-full border-4 border-green-500 pointer-events-none" />
        </div>
      </div>
    </div>
  );
}
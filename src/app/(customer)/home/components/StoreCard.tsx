"use client";

import {useState} from "react";
import Image from "next/image";
import {motion} from "framer-motion";
import {Heart, Star, MapPin, Truck, AlertCircle} from "lucide-react";

interface Store {
  id: string;
  name: string;
  description?: string;
  logoUrl?: string;
  bannerUrl?: string;
  city?: string;
  state?: string;
  distance?: number;
  rating?: number;
  isOpen?: boolean;
  status?: string;
  deliveryFee?: number;
}

interface StoreCardProps {
  store: Store;
  onClick: () => void;
}

export function StoreCard({store, onClick}: StoreCardProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const maxRadius = 25;
  const isTooFar = (store.distance || 0) > maxRadius;

  // Format distance
  const formatDistance = (distance?: number) => {
    if (!distance) return "0.0 mi";
    if (distance < 1) return `${(distance * 1000).toFixed(0)} m`;
    return `${distance.toFixed(1)} mi`;
  };

  // Get delivery fee based on distance
  const getDeliveryFee = (distance?: number) => {
    if (!distance) return "Calculating...";
    if (distance < 5) return "$5.99";
    if (distance < 8) return "$7.99";
    if (distance < 12) return "$10.99";
    if (distance < 25) return "$15.99";
    return "Unavailable";
  };

  // Get store status
  const isOpen = store.isOpen && store.status === "active";

  return (
    <motion.div
      whileTap={{scale: 0.98}}
      onClick={onClick}
      className={`bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition cursor-pointer ${
        isTooFar ? "opacity-75" : ""
      }`}
    >
      {/* Store Image */}
      <div className="relative h-48 bg-gray-200">
        {store.bannerUrl || store.logoUrl ? (
          <Image
            src={store.bannerUrl || store.logoUrl || "/placeholder-store.jpg"}
            alt={store.name}
            fill
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-orange-100 to-green-100 flex items-center justify-center">
            <span className="text-4xl font-bold text-gray-400">
              {store.name.charAt(0)}
            </span>
          </div>
        )}

        {/* Store Name Overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
          <h3 className="text-white font-bold text-lg">{store.name}</h3>
        </div>

        {/* Favorite Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsFavorite(!isFavorite);
          }}
          className="absolute top-3 right-3 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white transition"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart 
            className={`w-5 h-5 transition ${isFavorite ? "fill-orange-500 text-orange-500" : "text-gray-600"}`}
          />
        </button>

        {/* Distance Warning Badge */}
        {isTooFar && (
          <div className="absolute top-3 left-3 px-3 py-1.5 bg-orange-500 text-white text-xs font-semibold rounded-full flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            <span>Out of Radius</span>
          </div>
        )}

        {/* Status Badge */}
        {!isOpen && (
          <div className="absolute top-3 left-3 px-3 py-1 bg-red-500 text-white text-xs font-semibold rounded-full">
            Store is closed
          </div>
        )}
        {isOpen && store.status === "pending" && (
          <div className="absolute top-3 left-3 px-3 py-1 bg-yellow-500 text-white text-xs font-semibold rounded-full">
            Pending approval
          </div>
        )}
      </div>

      {/* Store Info */}
      <div className="p-4 space-y-3">
        {/* Store Name & Rating */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {store.logoUrl && (
              <div className="relative w-8 h-8 rounded-full overflow-hidden flex-shrink-0 border border-gray-200">
                <Image
                  src={store.logoUrl}
                  alt={store.name}
                  fill
                  className="object-cover"
                />
              </div>
            )}
            <h4 className="font-semibold text-gray-800">{store.name}</h4>
          </div>
          
          <div className="flex items-center gap-1">
            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
            <span className="text-sm font-medium text-gray-700">
              {store.rating || "4.5"} ★
            </span>
          </div>
        </div>

        {/* Distance & Delivery Fee */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1 text-gray-500">
            <MapPin className="w-4 h-4" />
            <span>{formatDistance(store.distance)}</span>
          </div>
          <div className={`flex items-center gap-1 ${
            isTooFar ? "text-red-500" : "text-gray-500"
          }`}>
            <Truck className="w-4 h-4" />
            <span>Delivery: {getDeliveryFee(store.distance)}</span>
          </div>
        </div>

        {/* Location & Warning */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-sm text-gray-400">
            <span>Location: {store.city}, {store.state}</span>
          </div>
          {isTooFar && (
            <span className="text-xs text-orange-500 font-medium">
              Beyond 25mi radius
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
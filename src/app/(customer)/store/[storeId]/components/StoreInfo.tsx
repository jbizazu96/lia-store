"use client";

/*
  Store information section.
  Uses consistent distance, delivery fee, and time formatting.
*/

import {motion} from "framer-motion";
import {Clock, MapPin, Truck, Star, ChevronRight} from "lucide-react";
import {
  formatDistance,
  getDeliveryFee,
  getEstimatedTime,
} from "@/services/distance";

interface StoreInfoProps {
  name: string;
  isOpen: boolean;
  distance: number;
  deliveryFee: number;
  estimatedPrepTime: number;
  minimumOrder: number;
  rating: number;
  reviewCount: number;
}

export function StoreInfo({
  name,
  isOpen,
  distance,
  deliveryFee,
  estimatedPrepTime,
  minimumOrder,
  rating,
  reviewCount,
}: StoreInfoProps) {
  // Use the shared formatting functions
  const formattedDistance = formatDistance(distance);
  
  // Get delivery fee from the service (uses the same logic as home page)
  const deliveryFeeDisplay = getDeliveryFee(distance);
  
  // Get estimated time from the service
  const formattedTime = getEstimatedTime(distance || estimatedPrepTime / 2);

  return (
    <motion.div
      initial={{opacity: 0, y: 20}}
      animate={{opacity: 1, y: 0}}
      className="bg-white rounded-2xl p-4 shadow-lg border border-gray-100 mt-12 relative z-10"
    >
      {/* Store Name & Rating */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">{name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-0.5">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span className="text-sm font-medium text-gray-700">{rating}</span>
            </div>
            <span className="text-xs text-gray-400">•</span>
            <span className="text-sm text-gray-500">{reviewCount} reviews</span>
          </div>
        </div>
        <button
          type="button"
          className="text-sm text-orange-600 font-medium hover:text-orange-700 transition flex items-center gap-1"
        >
          View More <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Open/Close Status */}
      <div className="flex items-center gap-2 mt-3">
        <div className={`w-2 h-2 rounded-full ${isOpen ? "bg-green-500" : "bg-red-500"}`} />
        <span className={`text-sm font-medium ${isOpen ? "text-green-600" : "text-red-600"}`}>
          {isOpen ? "Open" : "Closed"}
        </span>
        {isOpen && (
          <span className="text-xs text-gray-400">
            • Closes at 10:00 PM
          </span>
        )}
      </div>

      {/* Delivery Info - Using the same formatting as home page */}
      <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-gray-100">
        <div className="flex items-center gap-1.5 text-sm text-gray-600">
          <MapPin className="w-4 h-4 text-gray-400" />
          <span>{formattedDistance} away</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gray-600">
          <Truck className="w-4 h-4 text-gray-400" />
          <span>Delivery: {deliveryFeeDisplay}</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gray-600">
          <Clock className="w-4 h-4 text-gray-400" />
          <span>{formattedTime}</span>
        </div>
      </div>

      {/* Minimum Order */}
      <div className="mt-2 text-xs text-gray-400">
        Minimum order: ${minimumOrder.toFixed(2)}
      </div>
    </motion.div>
  );
}
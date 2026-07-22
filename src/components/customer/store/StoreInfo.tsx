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
import { motion } from "framer-motion";
import { Clock, MapPin, Truck, Star, ChevronRight, AlertCircle } from "lucide-react";
import {
  formatDistance,
  getDeliveryFee,
  getEstimatedTime,
} from "@/services/delivery/distance";
import { PRICING_CONFIG } from "@/config/pricing";
import { DELIVERY_CONFIG } from "@/config/delivery";

interface ScheduleDay {
  day: string;
  open: string;
  close: string;
  isClosed: boolean;
}

interface StoreInfoProps {
  name: string;
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
  isOpen: fallbackIsOpen,
  distance,
  deliveryFee,
  estimatedPrepTime,
  rating,
  reviewCount,
  schedule,
  onViewMore,
}: StoreInfoProps) {
  // Debug: Log schedule data
  console.log("StoreInfo - schedule received:", schedule);
  console.log("StoreInfo - schedule type:", typeof schedule);
  console.log("StoreInfo - is array:", Array.isArray(schedule));
  console.log("StoreInfo - length:", schedule?.length);

  // Use the shared formatting functions
  const formattedDistance = formatDistance(distance);
  
  const isWithinDeliveryRadius =
    distance <= DELIVERY_CONFIG.MAX_RADIUS_MILES;

  // Get delivery fee from the service (uses the same logic as home page)
  const deliveryFeeDisplay = getDeliveryFee(distance);
  
  // Get estimated time from the service
  const formattedTime = getEstimatedTime(distance || estimatedPrepTime / 2);


      const status = getStoreStatus(
          schedule,
          fallbackIsOpen
        );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative z-10 mx-auto mt-12 w-[95%] rounded-2xl border border-gray-100 bg-white p-4 shadow-lg"
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
            onClick={onViewMore}
            className="flex items-center gap-1 rounded-full bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
          >
            View More
            <ChevronRight className="w-4 h-4" />
          </button>
      </div>

      {/* Open/Close Status */}
      <div className="flex items-center gap-2 mt-3">
        <div className={`w-2 h-2 rounded-full ${status.statusColor}`} />
        <span className={`text-sm font-medium ${status.textColor}`}>
          {status.statusText}
        </span>
        {!status.isScheduleSet && (
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            No schedule set
          </span>
        )}
        {status.isScheduleSet && status.closingTime && (
          <span className="text-xs text-gray-400">
            • {status.message}
          </span>
        )}
        {status.isScheduleSet && !status.isOpen && status.message && (
          <span className="text-xs text-gray-400">
            • {status.message}
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
          <span className={isWithinDeliveryRadius ? undefined : "font-medium text-red-600"}>
            {isWithinDeliveryRadius
              ? `Delivery: ${deliveryFeeDisplay}`
              : "Delivery unavailable"}
          </span>
        </div>
        {isWithinDeliveryRadius && (
          <div className="flex items-center gap-1.5 text-sm text-gray-600">
            <Clock className="w-4 h-4 text-gray-400" />
            <span>{formattedTime}</span>
          </div>
        )}
      </div>

      {/* Minimum Order */}
      <div className="mt-2 text-xs text-gray-400">
        Minimum order: ${PRICING_CONFIG.DEFAULT_MINIMUM_ORDER.toFixed(2)}
      </div>
    </motion.div>
  );
}

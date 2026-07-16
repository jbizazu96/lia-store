"use client";

/*
  Distance warning modal - Shows when user tries to view a store outside delivery radius.
*/

import {motion} from "framer-motion";
import {X, MapPin, AlertCircle, Truck, Clock} from "lucide-react";
import {Store} from "../types";
import {formatDistance, getEstimatedTime} from "@/services/delivery/distance";

interface DistanceWarningModalProps {
  store: Store;
  distance: number;
  onClose: () => void;
  onContinue: () => void;
}

export function DistanceWarningModal({
  store,
  distance,
  onClose,
  onContinue,
}: DistanceWarningModalProps) {
  const maxRadius = 25;
  const formattedDistance = formatDistance(distance);
  const estimatedTime = getEstimatedTime(distance);

  // Format delivery fee
  const formatDeliveryFee = (fee: number) => {
    if (fee === 0) return "Free";
    return `$${fee.toFixed(2)}`;
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{opacity: 0, scale: 0.9}}
        animate={{opacity: 1, scale: 1}}
        exit={{opacity: 0, scale: 0.9}}
        className="bg-white rounded-3xl max-w-sm w-full p-6 max-h-[90vh] overflow-y-auto"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>

        {/* Icon */}
        <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-10 h-10 text-orange-600" />
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">
          Store is Far Away
        </h2>

        {/* Distance info */}
        <div className="bg-gray-50 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-gray-500" />
              <span className="text-gray-600">Distance:</span>
            </div>
            <span className="font-bold text-gray-800">{formattedDistance}</span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-gray-500" />
              <span className="text-gray-600">Delivery: </span>
            </div>
            <span className="font-bold text-gray-800">No Delivery</span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-500" />
              <span className="text-gray-600">Est. Time:</span>
            </div>
            <span className="font-bold text-gray-800">{estimatedTime}</span>
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-orange-500" />
              <span className="text-gray-600">Max Delivery:</span>
            </div>
            <span className="font-bold text-gray-800">{maxRadius} miles</span>
          </div>
        </div>

        {/* Store info */}
        <div className="text-center mb-6">
          <p className="text-gray-600 text-sm">
            <span className="font-semibold">{store.name}</span> is outside your delivery radius.
            Delivery may take longer or not be available.
          </p>
          <p className="text-gray-500 text-xs mt-2">
            You can still browse products, but checkout may be limited.
          </p>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-3">
          <button
            onClick={onContinue}
            className="w-full py-3 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 transition"
            aria-label="Continue browsing store"
          >
            View Store Anyway
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 border border-gray-200 text-gray-600 rounded-xl font-medium hover:bg-gray-50 transition"
            aria-label="Go back"
          >
            Go Back
          </button>
        </div>
      </motion.div>
    </div>
  );
}
"use client";

import {MapPin} from "lucide-react";
import {Address} from "../types";

interface DeliveryAddressSectionProps {
  address: Address | null;
  onEdit: () => void;
}

export function DeliveryAddressSection({address, onEdit}: DeliveryAddressSectionProps) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-orange-500" />
          <h3 className="font-semibold text-gray-800">Delivery Address</h3>
        </div>
        <button
          onClick={onEdit}
          className="text-sm text-orange-500 font-medium hover:text-orange-600 transition"
        >
          {address ? "Change" : "Add"}
        </button>
      </div>

      {address ? (
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-sm text-gray-800">
            {address.street}, {address.city}, {address.state} {address.zip}
          </p>
          {address.formattedAddress && address.formattedAddress !== `${address.street}, ${address.city}, ${address.state} ${address.zip}` && (
            <p className="text-xs text-gray-400 mt-0.5">{address.formattedAddress}</p>
          )}
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-sm text-gray-500">No delivery address set</p>
          <p className="text-xs text-gray-400">Please add your delivery address</p>
        </div>
      )}
    </div>
  );
}
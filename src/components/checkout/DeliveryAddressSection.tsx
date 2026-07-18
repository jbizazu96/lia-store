"use client";

import {MapPin, User, Phone, Edit2} from "lucide-react";
import type { CheckoutAddress } from "@/app/checkout/types";

interface DeliveryAddressSectionProps {
  address: CheckoutAddress | null;
  userName: string;
  userPhone: string;
  onEdit: () => void;
}

export function DeliveryAddressSection({
  address,
  userName,
  userPhone,
  onEdit,
}: DeliveryAddressSectionProps) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-orange-500" />
          <h3 className="font-semibold text-gray-800">Delivery Information</h3>
        </div>
        <button
          onClick={onEdit}
          className="text-sm text-orange-500 font-medium hover:text-orange-600 transition flex items-center gap-1"
        >
          <Edit2 className="w-3.5 h-3.5" />
          {address ? "Change" : "Add"}
        </button>
      </div>

      {address ? (
        <div className="bg-gray-50 rounded-xl p-3 space-y-2">
          {/* User Name */}
          {userName && (
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <User className="w-4 h-4 text-gray-400" />
              <span className="font-medium">{userName}</span>
            </div>
          )}
          {/* User Phone */}
          {userPhone && (
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Phone className="w-4 h-4 text-gray-400" />
              <span>{userPhone}</span>
            </div>
          )}
          {/* Address */}
          <div className="text-sm text-gray-600 pt-1 border-t border-gray-200">
            <p>{address.street}</p>
            <p>{address.city}, {address.state} {address.zip}</p>
            {address.formattedAddress && (
              <p className="text-xs text-gray-400 mt-0.5"></p>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-sm text-gray-500">No delivery information set</p>
          <p className="text-xs text-gray-400">Please add your delivery details</p>
        </div>
      )}
    </div>
  );
}

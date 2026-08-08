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
    <section className="overflow-hidden rounded-[26px] border border-gray-200 bg-transparent">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-4">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-orange-500" />
          <h3 className="font-extrabold text-gray-900">Delivery Information</h3>
        </div>
        <button
          onClick={onEdit}
          className="text-sm text-orange-500 font-medium hover:text-orange-600 transition flex items-center gap-1"
        >
          <Edit2 className="w-3.5 h-3.5" />
          {address ? "Change" : "Add"}
        </button>
      </div>

      <div className="px-4 py-4">
        {address ? (
          <div className="space-y-3">
          {/* User Name */}
          {userName && (
            <div className={`flex items-center gap-2 text-sm text-gray-700 ${userPhone ? "border-b border-gray-100 pb-3" : ""}`}>
              <User className="w-4 h-4 text-orange-500" />
              <span className="font-medium">{userName}</span>
            </div>
          )}
          {/* User Phone */}
          {userPhone && (
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Phone className="w-4 h-4 text-orange-500" />
              <span>{userPhone}</span>
            </div>
          )}
          {/* Address */}
          <div className="flex gap-2 border-t border-gray-100 pt-3 text-sm text-gray-600">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
            <div>
              <p>{address.street}</p>
              <p>{address.city}, {address.state} {address.zip}</p>
              {address.formattedAddress && (
                <p className="text-xs text-gray-400 mt-0.5"></p>
              )}
            </div>
          </div>
        </div>
        ) : (
          <div className="py-2 text-center">
            <p className="text-sm text-gray-500">No delivery information set</p>
            <p className="text-xs text-gray-400">Please add your delivery details</p>
          </div>
        )}
      </div>
    </section>
  );
}

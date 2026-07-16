"use client";

/*
  Customer information display.
*/

import {User, Phone, MapPin} from "lucide-react";

interface CustomerInfoProps {
  name: string;
  phone: string;
  address: string;
  notes?: string;
}

export function CustomerInfo({name, phone, address, notes}: CustomerInfoProps) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <h3 className="font-bold text-gray-800 mb-4">Customer</h3>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <User className="w-4 h-4 text-gray-400" />
          <span className="text-gray-600">{name}</span>
        </div>
        {phone && (
          <div className="flex items-center gap-3">
            <Phone className="w-4 h-4 text-gray-400" />
            <span className="text-gray-600">{phone}</span>
          </div>
        )}
        {address && (
          <div className="flex items-start gap-3">
            <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
            <span className="text-gray-600">{address}</span>
          </div>
        )}
        {notes && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-sm text-gray-500 font-medium">Notes:</p>
            <p className="text-sm text-gray-600 mt-1">{notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
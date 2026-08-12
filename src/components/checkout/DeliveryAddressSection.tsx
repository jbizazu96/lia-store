"use client";

import {useEffect, useMemo, useState} from "react";
import Image from "next/image";
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
  const mapUrl = useMemo(() => {
    if (!address || !process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) return "";
    const location = typeof address.latitude === "number" && typeof address.longitude === "number"
      ? `${address.latitude},${address.longitude}`
      : address.formattedAddress || [address.street, address.city, address.state, address.zip].filter(Boolean).join(", ");
    if (!location) return "";
    const encoded = encodeURIComponent(location);
    return `https://maps.googleapis.com/maps/api/staticmap?center=${encoded}&zoom=15&size=700x260&scale=2&markers=color:orange%7C${encoded}&key=${encodeURIComponent(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)}`;
  }, [address]);
  const [mapFailed, setMapFailed] = useState(false);
  useEffect(() => {queueMicrotask(() => setMapFailed(false));}, [mapUrl]);

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-transparent">
      {address && <div className="relative h-36 w-full border-b border-gray-100 bg-gray-100">
        <Image
          src={mapUrl && !mapFailed ? mapUrl : "/images/checkout-map-placeholder.png"}
          alt="Delivery address map"
          fill
          sizes="(max-width: 512px) 100vw, 512px"
          priority
          className="object-cover"
          onError={() => setMapFailed(true)}
        />
        <span className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg ring-4 ring-white/80"><MapPin className="h-5 w-5" /></span>
      </div>}
      <div className="flex items-center justify-end gap-3 border-b border-gray-100 px-4 py-3">
        <button
          onClick={onEdit}
          className="text-sm text-orange-500 font-medium hover:text-orange-600 transition flex items-center gap-1"
        >
          <Edit2 className="w-3.5 h-3.5" />
          {address ? "Change" : "Add"}
        </button>
      </div>

      <div className="px-4 pb-4 pt-3">
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

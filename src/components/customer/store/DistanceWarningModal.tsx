"use client";

import {motion} from "framer-motion";
import {AlertCircle, MapPin, Truck, X} from "lucide-react";
import {useRouter} from "next/navigation";
import type {CustomerStore} from "@/types/view-models/customerStore";
import {formatDistance} from "@/services/delivery/distance";

interface DistanceWarningModalProps {
  store: CustomerStore;
  distance: number;
  onClose: () => void;
  onContinue: () => void;
}

export function DistanceWarningModal({store, distance, onClose, onContinue}: DistanceWarningModalProps) {
  const router = useRouter();
  const outsideRadius = distance > store.maxDeliveryMiles;
  const requestOrderZone = () => router.push(`/help?request=order-zone&storeId=${encodeURIComponent(store.id)}&storeCity=${encodeURIComponent(store.city)}`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <motion.div initial={{opacity: 0, scale: 0.96}} animate={{opacity: 1, scale: 1}} exit={{opacity: 0, scale: 0.96}} className="relative max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-3xl bg-white p-6">
        <button type="button" onClick={onClose} className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full hover:bg-gray-100" aria-label="Close"><X className="h-5 w-5 text-gray-500" /></button>
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100"><AlertCircle className="h-8 w-8 text-orange-600" /></div>
        <h2 className="mb-2 text-center text-xl font-bold text-gray-900">This store is available for browsing only</h2>
        <p className="text-center text-sm leading-6 text-gray-600">
          {outsideRadius
            ? `${store.name} is ${formatDistance(distance)} away, beyond the ${store.maxDeliveryMiles}-mile delivery limit.`
            : !store.zoneAccessAllowed
              ? `${store.name} is not in your home zone or one of your approved Order Zones.`
              : "Ordering is not currently available for your delivery address."}
        </p>
        <div className="my-5 rounded-2xl bg-gray-50 p-4 text-sm">
          <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-gray-600"><MapPin className="h-4 w-4" />Distance</span><strong>{formatDistance(distance)}</strong></div>
          <div className="mt-2 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-gray-600"><Truck className="h-4 w-4" />Order status</span><strong className="text-orange-700">Browsing only</strong></div>
        </div>
        <p className="mb-5 text-center text-xs leading-5 text-gray-500">You can continue browsing. To shop from this area, send LIA Support an Order Zone request.</p>
        <div className="flex flex-col gap-3">
          <button type="button" onClick={requestOrderZone} className="w-full rounded-xl bg-orange-500 py-3 font-semibold text-white hover:bg-orange-600">Request an Order Zone</button>
          <button type="button" onClick={onContinue} className="w-full rounded-xl border border-gray-200 py-3 font-medium text-gray-700 hover:bg-gray-50">Continue browsing</button>
        </div>
      </motion.div>
    </div>
  );
}

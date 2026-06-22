"use client";

/*
  Delivery settings section.
*/

import {Truck, MapPin, DollarSign, Clock, Package} from "lucide-react";

interface DeliverySectionProps {
  storeData: any;
  setStoreData: (data: any) => void;
}

export function DeliverySection({storeData, setStoreData}: DeliverySectionProps) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="font-bold text-gray-800 mb-4">Delivery Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Delivery Radius (miles)
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="number"
                min="0"
                max="50"
                value={storeData?.deliveryRadius || 10}
                onChange={(e) => setStoreData({...storeData, deliveryRadius: parseFloat(e.target.value)})}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                placeholder="10"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Minimum Order Amount ($)
            </label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="number"
                min="0"
                step="0.01"
                value={storeData?.minimumOrder || 20}
                onChange={(e) => setStoreData({...storeData, minimumOrder: parseFloat(e.target.value)})}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                placeholder="20"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Delivery Fee ($)
            </label>
            <div className="relative">
              <Truck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="number"
                min="0"
                step="0.01"
                value={storeData?.deliveryFee || 2.99}
                onChange={(e) => setStoreData({...storeData, deliveryFee: parseFloat(e.target.value)})}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                placeholder="2.99"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Free Delivery Threshold ($)
            </label>
            <div className="relative">
              <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="number"
                min="0"
                step="0.01"
                value={storeData?.freeDeliveryThreshold || 50}
                onChange={(e) => setStoreData({...storeData, freeDeliveryThreshold: parseFloat(e.target.value)})}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                placeholder="50"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Estimated Prep Time (minutes)
            </label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="number"
                min="5"
                step="5"
                value={storeData?.estimatedPrepTime || 15}
                onChange={(e) => setStoreData({...storeData, estimatedPrepTime: parseInt(e.target.value)})}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                placeholder="15"
              />
            </div>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={storeData?.isOpen !== false}
                onChange={(e) => setStoreData({...storeData, isOpen: e.target.checked})}
                className="w-5 h-5 text-orange-500 focus:ring-orange-500 rounded"
              />
              <span className="font-medium">Store is Open</span>
              <span className="text-xs text-gray-400">
                (Accepting orders)
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
"use client";

import Image from "next/image";
import {Star, MapPin, Clock as ClockIcon, Package} from "lucide-react";
import {StoreGroup} from "../types";
import {SearchResult} from "../types";

interface StoreResultProps {
  group: StoreGroup;
  onStoreClick: (storeId: string) => void;
  onProductClick: (product: SearchResult) => void;
}

export function StoreResult({group, onStoreClick, onProductClick}: StoreResultProps) {
  // Format functions
  const formatDistance = (distance: number) => {
    if (distance < 1) return `${(distance * 1000).toFixed(0)} m`;
    return `${distance.toFixed(1)} mi`;
  };

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const formatDeliveryFee = (fee: number) => {
    if (fee === 0) return "Free";
    return `$${fee.toFixed(2)}`;
  };

  const formatPrice = (price: number) => {
    const dollars = Math.floor(price);
    const cents = Math.round((price - dollars) * 100);
    return { dollars, cents: cents.toString().padStart(2, '0') };
  };

  return (
    <div className="space-y-3">
      {/* Store Header */}
      <div 
        className="bg-white rounded-2xl p-4 shadow-sm cursor-pointer hover:shadow-md transition border border-gray-100"
        onClick={() => onStoreClick(group.storeId)}
      >
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-12 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
            {group.storeLogo ? (
              <Image
                src={group.storeLogo}
                alt={group.storeName}
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-orange-100">
                <span className="text-lg font-bold text-orange-600">
                  {group.storeName.charAt(0)}
                </span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-800 truncate">
              {group.storeName}
            </h3>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <div className="flex items-center gap-0.5">
                <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                <span>{group.storeRating}</span>
              </div>
              <div className="flex items-center gap-0.5">
                <MapPin className="w-3 h-3" />
                <span>{formatDistance(group.storeDistance)}</span>
              </div>
              <div className="flex items-center gap-0.5">
                <ClockIcon className="w-3 h-3" />
                <span>{formatTime(group.estimatedTime)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-400">
                Delivery {formatDeliveryFee(group.deliveryFee)}
              </span>
              <span className="text-xs text-gray-400">•</span>
              <span className="text-xs text-green-600 font-medium">
                {group.deliveryFee === 0 ? "Free Delivery" : "Delivery available"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Products from this store */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide px-1">
        {group.products.map((product) => {
          const price = formatPrice(product.price);
          return (
            <div
              key={product.id}
              onClick={() => onProductClick(product)}
              className="flex-shrink-0 w-40 bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition border border-gray-100 cursor-pointer"
            >
              <div className="relative h-28 bg-gray-100">
                {product.imageUrl ? (
                  <Image
                    src={product.imageUrl}
                    alt={product.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-8 h-8 text-gray-300" />
                  </div>
                )}
                {product.promotion && (
                  <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-orange-500 text-white text-[8px] font-medium rounded-full">
                    {product.promotion.type === "bogo" && "BOGO"}
                    {product.promotion.type === "discount" && `${product.promotion.discountAmount}% OFF`}
                  </div>
                )}
              </div>
              <div className="p-2.5">
                <h4 className="font-medium text-gray-800 text-xs truncate">
                  {product.name}
                </h4>
                <p className="text-[10px] text-gray-500 truncate">
                  {product.description}
                </p>
                {product.size && product.size.value > 0 && (
                  <p className="text-[10px] text-gray-400">
                    {product.size.value} {product.size.unit}
                  </p>
                )}
                <span className="text-sm font-bold text-gray-800">
                  ${price.dollars}
                  <sup className="text-[9px] font-semibold text-gray-600">
                    .{price.cents}
                  </sup>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
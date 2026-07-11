"use client";

import Image from "next/image";
import {CheckoutItem, OrderTotals} from "../types";

interface OrderSummaryProps {
  items: CheckoutItem[];
  totals: OrderTotals;
  storeName?: string;
}

export function OrderSummary({items, totals, storeName}: OrderSummaryProps) {
  const formatPrice = (price: number) => {
    const dollars = Math.floor(price);
    const cents = Math.round((price - dollars) * 100);
    return { dollars, cents: cents.toString().padStart(2, '0') };
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <h3 className="font-semibold text-gray-800 mb-3">Order Summary</h3>
      
      {/* Store Info */}
      {storeName && (
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
          <span className="text-sm font-medium text-gray-600">Store:</span>
          <span className="text-sm font-semibold text-gray-800">{storeName}</span>
        </div>
      )}

      {/* Items */}
      <div className="space-y-3 max-h-60 overflow-y-auto">
        {items.map((item) => {
          const price = formatPrice(item.price);
          return (
            <div key={item.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
              {/* Product Image - object-contain with bg-white */}
              <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-white border border-gray-100">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={item.name}
                    fill
                    className="object-contain p-1"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-lg">🛒</span>
                  </div>
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 text-sm truncate">{item.name}</p>
                <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
              </div>
              
              <div className="text-right">
                <p className="font-bold text-gray-800 text-sm">
                  ${price.dollars}
                  <sup className="text-[10px] font-semibold text-gray-600">.{price.cents}</sup>
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div className="mt-4 pt-3 border-t border-gray-200 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Subtotal</span>
          <span className="text-gray-800">${totals.subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Delivery Fee</span>
          <span className="text-gray-800">{totals.deliveryFee === 0 ? "Free" : `$${totals.deliveryFee.toFixed(2)}`}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Tax (8%)</span>
          <span className="text-gray-800">${totals.tax.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200">
          <span className="text-gray-800">Total</span>
          <span className="text-orange-600">${totals.total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
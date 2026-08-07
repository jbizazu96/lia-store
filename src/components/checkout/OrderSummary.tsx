"use client";

import {useState} from "react";
import {AnimatePresence} from "framer-motion";
import Image from "next/image";
import {Info, Store} from "lucide-react";
import {
  ProductPrice,
} from "@/components/ui/ProductPrice";
import {
  formatProductName,
} from "@/utils/productDisplay";
import {
  FeeInfoSheet,
  type FeeInfoType,
} from "@/components/customer/cart/FeeInfoSheet";
import type {
  CheckoutItem,
  CheckoutTotals,
} from "@/app/checkout/types";

interface OrderSummaryProps {
  items: CheckoutItem[];
  totals: CheckoutTotals;
  storeName?: string;
  storeAddress?: string;
}

export function OrderSummary({
  items,
  totals,
  storeName,
  storeAddress,
}: OrderSummaryProps) {
  const [feeInfoType, setFeeInfoType] = useState<FeeInfoType | null>(null);
  const hasFreeDelivery =
    totals.deliveryFee === 0 && totals.originalDeliveryFee > 0;

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <h3 className="font-semibold text-gray-800 mb-3">Order Summary</h3>
      
      {/* Store Info */}
      {storeName && (
        <div className="flex items-start gap-2 mb-3 pb-2 border-b border-gray-100">
          <Store className="w-4 h-4 text-orange-500 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-800">{storeName}</p>
            {storeAddress && (
              <p className="text-xs text-gray-400">{storeAddress}</p>
            )}
          </div>
        </div>
      )}

      {/* Items */}
      <div className="space-y-3 max-h-60 overflow-y-auto">
        {items.map((item) => {
          const productName =
            formatProductName(item.name);
          return (
            <div key={item.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
              <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-white border border-gray-100">
                {item.imageUrl ? (
                  <Image
                    src={item.imageUrl}
                    alt={productName}
                    fill
                    sizes="48px"
                    className="object-contain p-1"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-lg">🛒</span>
                  </div>
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="font-sans text-sm font-semibold text-gray-900 truncate">
                  {productName}
                </p>
                <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
              </div>
              
              <div className="text-right">
                {typeof item.originalPrice === "number" &&
                  item.originalPrice > item.price && (
                    <p className="mb-0.5 text-xs text-gray-400 line-through">
                      ${(item.originalPrice * item.quantity).toFixed(2)}
                    </p>
                  )}
                <ProductPrice
                  price={item.price * item.quantity}
                  className="text-gray-900"
                />
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
        
        <div className="flex items-center justify-between gap-4 text-sm">
          <button
            type="button"
            onClick={() => setFeeInfoType("delivery")}
            className="inline-flex items-center gap-1 text-gray-500 transition hover:text-gray-800"
            aria-label="Learn about the delivery fee"
          >
            Delivery Fee
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          {hasFreeDelivery ? (
            <span className="flex items-center gap-2 font-medium text-gray-800">
              <span className="text-gray-400 line-through">
                ${totals.originalDeliveryFee.toFixed(2)}
              </span>
              <span>$0.00</span>
            </span>
          ) : (
            <span className="text-gray-800">
              ${totals.deliveryFee.toFixed(2)}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 text-sm">
          <button
            type="button"
            onClick={() => setFeeInfoType("service")}
            className="inline-flex items-center gap-1 text-gray-500 transition hover:text-gray-800"
            aria-label="Learn about the service fee"
          >
            Service Fee
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <span className="text-gray-800">
            ${totals.serviceFee.toFixed(2)}
          </span>
        </div>
        
        
        {/* ✅ Tip - ONLY visible if greater than 0 */}
       {totals.tip > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Driver Tip</span>
            <span className="text-gray-800">${totals.tip.toFixed(2)}</span>
          </div>
        )}
        
        <div className="flex items-center justify-between gap-4 text-sm">
          <button
            type="button"
            onClick={() => setFeeInfoType("tax")}
            className="inline-flex items-center gap-1 text-gray-500 transition hover:text-gray-800"
            aria-label="Learn about estimated tax"
          >
            Estimated Tax
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <span className="text-gray-800">${totals.tax.toFixed(2)}</span>
        </div>
        
        <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200">
          <span className="text-gray-800">Total</span>
          <span className="text-orange-600">${totals.total.toFixed(2)}</span>
        </div>
      </div>

      <AnimatePresence>
        {feeInfoType && (
          <FeeInfoSheet
            type={feeInfoType}
            estimatedTax={totals.tax}
            onClose={() => setFeeInfoType(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

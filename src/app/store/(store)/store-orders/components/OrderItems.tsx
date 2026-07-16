"use client";

/*
  Order items list with quantities and prices.
*/

import {Receipt} from "lucide-react";
import {OrderItem} from "../types";

interface OrderItemsProps {
  items: OrderItem[];
}

export function OrderItems({items}: OrderItemsProps) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-center gap-2 mb-4">
        <Receipt className="w-5 h-5 text-orange-500" />
        <h3 className="font-bold text-gray-800">Order Items</h3>
        <span className="text-xs text-gray-400 ml-auto">{items.length} items</span>
      </div>
      <div className="divide-y divide-gray-100">
        {items.map((item, index) => (
          <div key={index} className="py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-sm font-medium text-gray-600">
                {item.quantity}
              </span>
              <div>
                <p className="font-medium text-gray-800">{item.name}</p>
                <p className="text-sm text-gray-500">${item.price.toFixed(2)} each</p>
              </div>
            </div>
            <p className="font-bold text-gray-800">${item.total.toFixed(2)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
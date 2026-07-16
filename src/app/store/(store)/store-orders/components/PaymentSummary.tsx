"use client";

/*
  Payment breakdown summary.
*/

import {CreditCard} from "lucide-react";

interface PaymentSummaryProps {
  subtotal: number;
  tax: number;
  total: number;
}

export function PaymentSummary({subtotal, tax, total}: PaymentSummaryProps) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <h3 className="font-bold text-gray-800 mb-4">Payment Summary</h3>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Subtotal</span>
          <span className="text-gray-800">${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Tax</span>
          <span className="text-gray-800">${tax.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200">
          <span className="text-gray-800">Total</span>
          <span className="text-orange-600">${total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
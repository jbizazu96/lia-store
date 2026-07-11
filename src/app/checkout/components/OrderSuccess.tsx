"use client";

import {motion} from "framer-motion";
import {CheckCircle, Truck, Clock} from "lucide-react";

interface OrderSuccessProps {
  orderId: string;
  onViewOrders: () => void;
}

export function OrderSuccess({orderId, onViewOrders}: OrderSuccessProps) {
  return (
    <motion.div
      initial={{opacity: 0, scale: 0.95}}
      animate={{opacity: 1, scale: 1}}
      className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-lg"
    >
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckCircle className="w-10 h-10 text-green-600" />
      </div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Order Placed! 🎉</h2>
      <p className="text-gray-500 text-sm mb-4">
        Your order #{orderId.slice(0, 8).toUpperCase()} has been placed successfully.
      </p>
      <p className="text-gray-400 text-xs">
        You'll receive a confirmation email shortly.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <Truck className="w-4 h-4" />
          <span>Estimated delivery: 30-45 min</span>
        </div>
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
          <Clock className="w-4 h-4" />
          <span>Order tracking available soon</span>
        </div>
      </div>
      <button
        onClick={onViewOrders}
        className="mt-6 w-full py-3 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 transition"
      >
        View My Orders
      </button>
    </motion.div>
  );
}
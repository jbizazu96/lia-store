"use client";

/*
  Empty state for orders.
*/

import {motion} from "framer-motion";
import {Package, ShoppingBag, Truck, Clock} from "lucide-react";

export function EmptyOrders() {
  return (
    <motion.div
      initial={{opacity: 0, y: 20}}
      animate={{opacity: 1, y: 0}}
      className="text-center py-16"
    >
      {/* Empty State Illustration */}
      <div className="relative w-48 h-48 mx-auto mb-8">
        <div className="absolute inset-0 bg-orange-100 rounded-full opacity-20 scale-150" />
        <div className="relative w-full h-full flex items-center justify-center">
          <Package className="w-24 h-24 text-orange-300" />
          <motion.div
            animate={{
              y: [0, -10, 0],
            }}
            transition={{
              repeat: Infinity,
              duration: 2,
              ease: "easeInOut",
            }}
            className="absolute -top-2 -right-2 w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center"
          >
            <span className="text-2xl">📦</span>
          </motion.div>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-gray-800 mb-2">
        No orders yet
      </h2>
      <p className="text-gray-500 text-sm mb-6 max-w-xs mx-auto">
        When customers place orders, they'll appear here. 
        Share your store with customers to start receiving orders!
      </p>

      <div className="mt-8 flex flex-col gap-3 text-sm text-gray-400">
        <div className="flex items-center justify-center gap-2">
          <ShoppingBag className="w-4 h-4" />
          <span>Share your store link with customers</span>
        </div>
        <div className="flex items-center justify-center gap-2">
          <Truck className="w-4 h-4" />
          <span>Manage deliveries in real-time</span>
        </div>
        <div className="flex items-center justify-center gap-2">
          <Clock className="w-4 h-4" />
          <span>Track order status from start to finish</span>
        </div>
      </div>
    </motion.div>
  );
}
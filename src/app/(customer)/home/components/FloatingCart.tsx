"use client";

/*
  Floating cart summary for the home page.
  Appears at the bottom when items are in cart.
  Matches the design of the store page bottom bar.
*/

import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag, ChevronRight } from "lucide-react";

interface FloatingCartProps {
  itemCount: number;
  totalPrice: number;
  onClick: () => void;
}

export function FloatingCart({ itemCount, totalPrice, onClick }: FloatingCartProps) {
  // Don't show if cart is empty
  if (itemCount === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 max-w-lg mx-auto">
      <AnimatePresence>
        <motion.button
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          onClick={onClick}
          className="w-full flex items-center justify-between px-5 py-3.5 bg-orange-500 text-white rounded-3xl shadow-lg hover:bg-orange-600 transition"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <ShoppingBag className="w-5 h-5" />
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-white text-orange-500 text-[10px] font-bold rounded-full flex items-center justify-center">
                {itemCount > 99 ? "99+" : itemCount}
              </span>
            </div>
            <span className="font-medium text-sm">
              {itemCount} item{itemCount !== 1 ? 's' : ''} in cart
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold">
              ${totalPrice.toFixed(2)}
            </span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </motion.button>
      </AnimatePresence>
    </div>
  );
}
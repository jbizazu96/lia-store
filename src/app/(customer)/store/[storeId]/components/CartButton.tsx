"use client";

/*
  Floating cart button with count.
  Uses CartContext for global state.
  Positioned above the bottom navigation with proper spacing.
*/

import {motion, AnimatePresence} from "framer-motion";
import {ShoppingCart} from "lucide-react";
import Link from "next/link";
import {useCart} from "@/context/CartContext";

export function CartButton() {
  const {itemCount, totalPrice} = useCart();

  if (itemCount === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{opacity: 0, y: 20, scale: 0.9}}
        animate={{opacity: 1, y: 0, scale: 1}}
        exit={{opacity: 0, y: 20, scale: 0.9}}
        className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md"
      >
        <Link
          href="/cart"
          className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-2xl shadow-lg hover:shadow-xl transition"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <ShoppingCart className="w-5 h-5" />
              <span className="absolute -top-2 -right-2 w-5 h-5 bg-white text-orange-600 text-xs font-bold rounded-full flex items-center justify-center">
                {itemCount > 99 ? "99+" : itemCount}
              </span>
            </div>
            <span className="font-medium">
              {itemCount} item{itemCount !== 1 ? 's' : ''} in cart
            </span>
          </div>
          <span className="font-bold text-lg">
            ${totalPrice.toFixed(2)}
          </span>
        </Link>
      </motion.div>
    </AnimatePresence>
  );
}
"use client";

/*
  Floating cart button.
*/

import {motion} from "framer-motion";
import {ShoppingCart} from "lucide-react";
import Link from "next/link";

interface CartButtonProps {
  count: number;
}

export function CartButton({count}: CartButtonProps) {
  if (count === 0) return null;

  return (
    <motion.div
      initial={{opacity: 0, y: 20}}
      animate={{opacity: 1, y: 0}}
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50"
    >
      <Link
        href="/cart"
        className="flex items-center gap-3 px-6 py-3 bg-orange-500 text-white rounded-full shadow-lg hover:bg-orange-600 transition"
      >
        <ShoppingCart className="w-5 h-5" />
        <span className="font-medium">{count} item{count !== 1 ? 's' : ''} in cart</span>
        <span className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-sm font-bold">
          ${(count * 12.99).toFixed(2)}
        </span>
      </Link>
    </motion.div>
  );
}
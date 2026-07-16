"use client";

/*
  Sticky bottom bar with floating search and cart summary.
  No white card background - just floating elements.
*/

import {motion, AnimatePresence} from "framer-motion";
import {Search, ShoppingBag, ChevronRight} from "lucide-react";

interface BottomBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  itemCount: number;
  totalPrice: number;
  storeId: string;
  onCartClick: () => void;
}

export function BottomBar({
  searchQuery,
  onSearchChange,
  itemCount,
  totalPrice,
  storeId,
  onCartClick,
}: BottomBarProps) {
  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        {/* Search Bar - Floating with shadow */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search this store..."
            className="w-full pl-9 pr-4 py-3 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent text-sm placeholder-gray-400 shadow-lg"
          />
        </div>

        {/* Cart Summary - Floating with shadow */}
        <AnimatePresence>
          {itemCount > 0 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9, x: 10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9, x: 10 }}
              onClick={onCartClick}
              className="flex items-center gap-2 px-4 py-3 bg-orange-500 text-white rounded-2xl hover:bg-orange-600 transition flex-shrink-0 shadow-lg"
            >
              <div className="relative">
                <ShoppingBag className="w-5 h-5" />
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-white text-orange-500 text-[10px] font-bold rounded-full flex items-center justify-center">
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              </div>
              <span className="font-semibold">
                ${totalPrice.toFixed(2)}
              </span>
              <ChevronRight className="w-4 h-4" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
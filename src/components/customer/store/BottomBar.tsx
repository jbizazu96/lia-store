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
  /** Opens the dedicated, store-scoped product search when provided. */
  onSearchClick?: () => void;
  /** Search result pages keep only the cart control in this bar. */
  showSearch?: boolean;
  itemCount: number;
  totalPrice: number;
  onCartClick: () => void;
}

export function BottomBar({
  searchQuery,
  onSearchChange,
  onSearchClick,
  showSearch = true,
  itemCount,
  totalPrice,
  onCartClick,
}: BottomBarProps) {
  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-lg rounded-[26px] border border-white/75 bg-white/60 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_18px_45px_rgba(15,23,42,0.16)] backdrop-blur-[24px] backdrop-saturate-[1.8]">
      <div className="flex items-center gap-2">
        {/* Search Bar - Floating with shadow */}
        {showSearch && (
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            {onSearchClick ? (
              <button
                type="button"
                onClick={onSearchClick}
                className="w-full rounded-[20px] border border-white/80 bg-white/65 py-3 pl-9 pr-4 text-left text-base font-medium text-gray-500 transition hover:bg-white/80 focus:outline-none focus:ring-2 focus:ring-orange-400 sm:text-sm"
              >
                Search this store...
              </button>
            ) : (
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search this store..."
                className="w-full rounded-[20px] border border-white/80 bg-white/65 py-3 pl-9 pr-4 text-base placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-400 sm:text-sm"
              />
            )}
          </div>
        )}

        {/* Cart Summary - Floating with shadow */}
        <AnimatePresence>
          {itemCount > 0 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9, x: 10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9, x: 10 }}
              onClick={onCartClick}
              className="flex flex-shrink-0 items-center gap-2 rounded-[20px] bg-orange-500 px-4 py-3 text-white shadow-lg transition hover:bg-orange-600"
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

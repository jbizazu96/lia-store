"use client";

/*
  Product section with horizontal scrolling cards (Mobile optimized).
*/

import {useRef} from "react";
import {motion} from "framer-motion";
import {ChevronRight, ChevronLeft} from "lucide-react";
import {Category, Product} from "../types";
import {ProductCard} from "./ProductCard";

interface ProductSectionProps {
  category: Category;
  products: Product[];
  onAddToCart: (product: Product) => void;
  onViewAll: () => void;
}

export function ProductSection({
  category,
  products,
  onAddToCart,
  onViewAll,
}: ProductSectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (products.length === 0) return null;

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 300;
      const newScrollLeft = scrollRef.current.scrollLeft + 
        (direction === "left" ? -scrollAmount : scrollAmount);
      scrollRef.current.scrollTo({left: newScrollLeft, behavior: "smooth"});
    }
  };

  return (
    <div className="mt-4 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-lg">{category.icon}</span>
          <h3 className="font-bold text-gray-800 text-sm">{category.name}</h3>
          <span className="text-xs text-gray-400">({products.length})</span>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="text-xs text-orange-600 font-medium hover:text-orange-700 transition flex items-center gap-0.5"
        >
          View All <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Horizontal Scroll Container */}
      <div className="relative">
        {/* Left Scroll Button */}
        <button
          type="button"
          onClick={() => scroll("left")}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-6 h-6 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-gray-50 transition -ml-2 border border-gray-200"
          aria-label="Scroll left"
        >
          <ChevronLeft className="w-3 h-3 text-gray-600" />
        </button>

        {/* Products - Horizontal Scroll */}
        <div
          ref={scrollRef}
          className="flex gap-2.5 overflow-x-auto pb-3 scrollbar-hide px-1"
          style={{scrollbarWidth: "none", msOverflowStyle: "none"}}
        >
          {products.map((product, index) => (
            <motion.div
              key={product.id}
              initial={{opacity: 0, scale: 0.9}}
              animate={{opacity: 1, scale: 1}}
              transition={{delay: index * 0.03}}
              className="flex-shrink-0"
            >
              <ProductCard
                product={product}
                onAddToCart={onAddToCart}
              />
            </motion.div>
          ))}
        </div>

        {/* Right Scroll Button */}
        <button
          type="button"
          onClick={() => scroll("right")}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-6 h-6 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-gray-50 transition -mr-2 border border-gray-200"
          aria-label="Scroll right"
        >
          <ChevronRight className="w-3 h-3 text-gray-600" />
        </button>
      </div>
    </div>
  );
}
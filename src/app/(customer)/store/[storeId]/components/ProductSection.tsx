"use client";

/*
  Product section with horizontal scrolling.
*/

import {useRef} from "react";
import {motion} from "framer-motion";
import {ChevronRight} from "lucide-react";
import {Category, Product} from "../types";
import {ProductCard} from "./ProductCard";

interface ProductSectionProps {
  category: Category;
  products: Product[];
  onAddToCart: (product: Product) => void;
  onQuantityChange: (productId: string, quantity: number) => void;
  getQuantity: (productId: string) => number;
  onViewAll: () => void;
}

export function ProductSection({
  category,
  products,
  onAddToCart,
  onQuantityChange,
  getQuantity,
  onViewAll,
}: ProductSectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (products.length === 0) return null;

  const capitalize = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  return (
    <div className="mt-4 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{category.icon}</span>
          <h3 className="font-bold text-gray-800 text-base">
            {capitalize(category.name)}
          </h3>
          <span className="text-xs text-gray-400 font-medium">
            ({products.length})
          </span>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="text-sm text-orange-600 font-semibold hover:text-orange-700 transition flex items-center gap-0.5"
        >
          View All <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Products */}
      <div
        ref={scrollRef}
        className="flex gap-2.5 overflow-x-auto pb-3 scrollbar-hide px-1 snap-x snap-mandatory"
        style={{scrollbarWidth: "none", msOverflowStyle: "none"}}
      >
        {products.map((product, index) => (
          <motion.div
            key={product.id}
            initial={{opacity: 0, scale: 0.9}}
            animate={{opacity: 1, scale: 1}}
            transition={{delay: index * 0.03}}
            className="flex-shrink-0 snap-start"
          >
            <ProductCard
              product={product}
              onAddToCart={onAddToCart}
              onQuantityChange={onQuantityChange}
              quantity={getQuantity(product.id)}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
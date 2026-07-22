"use client";

/*
  Product section with horizontal scrolling.
*/

import {useRef} from "react";
import {motion} from "framer-motion";
import {ArrowRight} from "lucide-react";
import type { Category } from "@/types/category";
import type { Product } from "@/types/product";
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
    <section className="mt-4 px-4">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {category.icon && (
            <span className="text-xl">{category.icon}</span>
          )}
          <h3 className="text-lg font-bold text-gray-900">
            {capitalize(category.name)}
          </h3>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-gray-900 transition hover:bg-orange-500 hover:text-white"
          aria-label={`View all ${category.name} products`}
        >
          <ArrowRight className="h-6 w-6" strokeWidth={2.5} />
        </button>
      </div>

      {/* Products */}
      <div
        ref={scrollRef}
        className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide px-0.5 snap-x snap-mandatory"
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
    </section>
  );
}

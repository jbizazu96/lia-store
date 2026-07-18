"use client";

/*
  Dynamic category scroll - Generated from product data.
  Filters products by category when clicked.
  Shows category names with proper capitalization.
*/

import {useRef} from "react";
import type { Category } from "@/types/category";

interface CategoryScrollProps {
  categories: Category[];
  selectedCategory: string;
  onSelect: (categoryId: string) => void;
}

export function CategoryScroll({
  categories,
  selectedCategory,
  onSelect,
}: CategoryScrollProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Capitalize first letter of category name
  const capitalize = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  // If no categories, don't render
  if (!categories || categories.length === 0) {
    return null;
  }

  // Calculate total products
  const totalProducts = categories.reduce((sum, cat) => sum + cat.products.length, 0);

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto scrollbar-hide px-1 py-1.5 snap-x snap-mandatory"
        style={{scrollbarWidth: "none", msOverflowStyle: "none"}}
      >
        {/* All Categories Button */}
        <button
          type="button"
          onClick={() => onSelect("all")}
          className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition whitespace-nowrap snap-start ${
            selectedCategory === "all"
              ? "bg-orange-500 text-white shadow-md"
              : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
          }`}
        >
          All
          <span className="text-xs opacity-70 ml-1">({totalProducts})</span>
        </button>

        {/* Category Buttons */}
        {categories.map((category) => (
          <button
            type="button"
            key={category.id}
            onClick={() => onSelect(category.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition flex items-center gap-1.5 whitespace-nowrap snap-start ${
              selectedCategory === category.id
                ? "bg-orange-500 text-white shadow-md"
                : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
            }`}
          >
            <span className="text-base">{category.icon}</span>
            {capitalize(category.name)}
            <span className="text-xs opacity-70 ml-0.5">
              ({category.products.length})
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

"use client";

/*
  Horizontal category scroll component.
  Shows categories with icons for filtering.
*/

import {useRef} from "react";
import {motion} from "framer-motion";
import {ChevronLeft, ChevronRight} from "lucide-react";
import {Category} from "../types";

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

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 200;
      const newScrollLeft = scrollRef.current.scrollLeft + 
        (direction === "left" ? -scrollAmount : scrollAmount);
      scrollRef.current.scrollTo({left: newScrollLeft, behavior: "smooth"});
    }
  };

  // If no categories, don't render
  if (!categories || categories.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      {/* Left Arrow */}
      <button
        type="button"
        onClick={() => scroll("left")}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-gray-50 transition -ml-2 border border-gray-200"
        aria-label="Scroll categories left"
      >
        <ChevronLeft className="w-3.5 h-3.5 text-gray-600" />
      </button>

      {/* Categories */}
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto scrollbar-hide px-3 py-1.5"
        style={{scrollbarWidth: "none", msOverflowStyle: "none"}}
      >
        {/* All Categories Button */}
        <button
          type="button"
          onClick={() => onSelect("all")}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap ${
            selectedCategory === "all"
              ? "bg-orange-500 text-white"
              : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
          }`}
        >
          All
        </button>

        {/* Category Buttons */}
        {categories.map((category) => (
          <button
            type="button"
            key={category.id}
            onClick={() => onSelect(category.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
              selectedCategory === category.id
                ? "bg-orange-500 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
            }`}
          >
            <span className="text-sm">{category.icon}</span>
            {category.name}
          </button>
        ))}
      </div>

      {/* Right Arrow */}
      <button
        type="button"
        onClick={() => scroll("right")}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-gray-50 transition -mr-2 border border-gray-200"
        aria-label="Scroll categories right"
      >
        <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
      </button>
    </div>
  );
}
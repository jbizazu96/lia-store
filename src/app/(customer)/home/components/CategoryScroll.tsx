"use client";

/*
  Horizontal category scroll - DoorDash style.
*/

import {useRef} from "react";

interface Category {
  id: string;
  name: string;
  icon: string;
}

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

  return (
    <div 
      ref={scrollRef}
      className="flex gap-1.5 overflow-x-auto scrollbar-hide py-1"
      style={{scrollbarWidth: "none", msOverflowStyle: "none"}}
    >
      {categories.map((category) => (
        <button
          type="button"
          key={category.id}
          onClick={() => onSelect(category.id)}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition flex items-center gap-1 ${
            selectedCategory === category.id
              ? "bg-orange-500 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          <span className="text-sm">{category.icon}</span>
          {category.name}
        </button>
      ))}
    </div>
  );
}
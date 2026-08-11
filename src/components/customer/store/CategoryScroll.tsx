"use client";

/*
|--------------------------------------------------------------------------
| Store Category Navigation
|--------------------------------------------------------------------------
|
| A visual, touch-friendly category strip. Deals is a first-class filter;
| category icons stay useful even when a Firestore category has no icon.
|
*/

import Image from "next/image";
import {ShoppingBag, Tag} from "lucide-react";
import type {Category} from "@/types/category";

interface CategoryScrollProps {
  categories: Category[];
  onCategoryClick: (categoryId: string) => void;
  onDealsClick: () => void;
}

function formatCategoryName(name: string): string {
  return name
    .trim()
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

export function CategoryScroll({
  categories,
  onCategoryClick,
  onDealsClick,
}: CategoryScrollProps) {
  if (categories.length === 0) {
    return null;
  }

  return (
    <nav
      className="relative"
      aria-label="Browse product categories"
    >
      <div
        className="flex gap-3 overflow-x-auto px-0.5 pb-2 pt-1 scrollbar-hide"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        <button
          type="button"
          onClick={onDealsClick}
          className="flex w-[84px] shrink-0 flex-col items-center gap-1.5 rounded-xl border border-black/[0.025] px-2 py-2 transition hover:-translate-y-0.5 hover:border-black/[0.05] focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
        >
          <span className="flex h-12 w-12 items-center justify-center">
            <Tag className="h-7 w-7 text-red-600" aria-hidden="true" />
          </span>
          <span className="min-h-10 text-center text-sm font-semibold leading-5 text-gray-900">
            Deals
          </span>
        </button>

        {categories.map((category) => (
            <button
              type="button"
              key={category.id}
              onClick={() =>
                onCategoryClick(category.id)
              }
              className="flex w-[84px] shrink-0 flex-col items-center gap-1.5 rounded-xl border border-black/[0.025] px-2 py-2 transition hover:-translate-y-0.5 hover:border-black/[0.05] focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
            >
              <span className="flex h-12 w-12 items-center justify-center">
                {category.iconUrl ? (
                  <Image
                    src={category.iconUrl}
                    alt=""
                    width={48}
                    height={48}
                    sizes="48px"
                    className="h-12 w-12 object-contain"
                  />
                ) : (
                  <ShoppingBag className="h-7 w-7 text-orange-600" aria-hidden="true" />
                )}
              </span>
              <span className="line-clamp-2 min-h-10 text-center text-sm font-semibold leading-5 text-gray-900">
                {formatCategoryName(category.name)}
              </span>
            </button>
          ))}
      </div>
    </nav>
  );
}

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

import type {Category} from "@/types/category";

interface CategoryScrollProps {
  categories: Category[];
  onCategoryClick: (categoryId: string) => void;
  onDealsClick: () => void;
}

const CATEGORY_ICONS: Record<string, string> = {
  produce: "🥦",
  meat: "🥩",
  seafood: "🦐",
  dairy: "🥛",
  bakery: "🥖",
  oil: "🫗",
  grains: "🌾",
  spices: "🫚",
  beverages: "🥤",
  snacks: "🍿",
  frozen: "🧊",
  canned: "🥫",
  household: "🏠",
  other: "🛍️",
};

function getCategoryIcon(category: Category): string {
  if (category.icon?.trim()) {
    return category.icon;
  }

  const normalizedName = category.name
    .trim()
    .toLowerCase();

  return (
    CATEGORY_ICONS[category.id.toLowerCase()] ??
    CATEGORY_ICONS[normalizedName] ??
    "🛍️"
  );
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
          className="flex w-[78px] shrink-0 flex-col items-center gap-2 rounded-2xl py-1.5 transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-red-100 bg-red-50 text-3xl shadow-sm">
            🏷️
          </span>
          <span className="text-center text-sm font-semibold text-gray-900">
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
              className="flex w-[78px] shrink-0 flex-col items-center gap-2 rounded-2xl py-1.5 transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-black/[0.04] bg-[#f5f7f2] text-3xl shadow-sm">
                {getCategoryIcon(category)}
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

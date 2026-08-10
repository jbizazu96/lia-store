"use client";

import { Store } from "lucide-react";

interface MarketplaceCategoryNavProps {
  categories: string[];
  selectedCategory: string | null;
  onSelect: (category: string | null) => void;
}

function categoryLabel(category: string): string {
  return category
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function MarketplaceCategoryNav({
  categories,
  selectedCategory,
  onSelect,
}: MarketplaceCategoryNavProps) {
  if (categories.length === 0) return null;

  const options = [null, ...categories] as const;

  return (
    <nav aria-label="Store categories" className="border-b border-slate-100">
      <div className="mx-auto flex max-w-2xl gap-2 overflow-x-auto px-4 pb-4 pt-5 scrollbar-hide">
        {options.map((category) => {
          const isSelected = selectedCategory === category;
          const label = category ? categoryLabel(category) : "All stores";

          return (
            <button
              key={category ?? "all-stores"}
              type="button"
              onClick={() => onSelect(category)}
              aria-pressed={isSelected}
              className={`flex min-w-[64px] shrink-0 flex-col items-center gap-2 transition ${
                isSelected ? "text-orange-600" : "text-slate-700 hover:text-orange-600"
              }`}
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  isSelected ? "bg-orange-50" : "bg-slate-50"
                }`}
              >
                <Store className="h-5 w-5" strokeWidth={2.1} />
              </span>
              <span className="max-w-24 text-center text-xs font-semibold leading-tight">
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

"use client";

import {ArrowLeft, Search, X} from "lucide-react";

interface SearchHeaderProps {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  onBack: () => void;
  onSubmit: () => void;
}

export function SearchHeader({
  value,
  onChange,
  onClear,
  onBack,
  onSubmit,
}: SearchHeaderProps) {
  return (
    <div className="bg-white border-b border-gray-100 sticky top-0 z-20">
      <div className="flex items-center gap-2 px-4 py-3 max-w-lg mx-auto">
        <button
          onClick={onBack}
          className="p-2 hover:bg-gray-100 rounded-full transition flex-shrink-0"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>

        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSubmit();
              }
            }}
            placeholder="Search products, stores..."
            className="w-full pl-9 pr-10 py-2.5 bg-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 text-base sm:text-sm"
            autoFocus
          />
          {value && (
            <button
              onClick={onClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 rounded-full transition"
              aria-label="Clear search"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

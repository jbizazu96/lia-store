"use client";

import {Search} from "lucide-react";

interface SearchBarProps {
  value?: string;
  onChange?: (value: string) => void;
  onOpen?: () => void;
  placeholder?: string;
}

export function SearchBar({
  value,
  onChange,
  onOpen,
  placeholder = "Search stores...",
}: SearchBarProps) {
  if (onOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="relative flex w-full items-center rounded-2xl border border-black/[0.06] bg-white px-4 py-3.5 text-left text-base font-medium text-slate-400 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.7)] transition hover:border-orange-200 focus:outline-none focus:ring-2 focus:ring-orange-400 sm:text-sm"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-50">
          <Search className="h-4 w-4 text-orange-600" />
        </span>
        <span className="ml-3">{placeholder}</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-full border border-gray-200 bg-white py-2.5 pl-9 pr-4 text-base focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-400 sm:text-sm"
      />
    </div>
  );
}

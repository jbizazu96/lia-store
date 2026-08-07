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
        className="relative flex w-full items-center rounded-full border border-gray-200 bg-white px-4 py-2.5 text-left text-base text-gray-400 transition hover:border-orange-300 hover:bg-orange-50/30 focus:outline-none focus:ring-2 focus:ring-orange-400 sm:text-sm"
      >
        <Search className="h-4 w-4 text-gray-400" />
        <span className="ml-2.5">{placeholder}</span>
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

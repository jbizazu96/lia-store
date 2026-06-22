"use client";

import {Search} from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSearch?: () => void;
}

export function SearchBar({value, onChange, onSearch}: SearchBarProps) {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch?.();
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search in LIA"
        className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
        aria-label="Search for stores and products"
      />
      <button 
        type="submit" 
        className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-orange-500 text-white text-sm font-medium rounded-xl hover:bg-orange-600 transition"
        aria-label="Submit search"
      >
        Search
      </button>
    </form>
  );
}
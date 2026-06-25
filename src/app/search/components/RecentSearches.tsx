"use client";

import {Clock} from "lucide-react";

interface RecentSearchesProps {
  searches: string[];
  onSelect: (query: string) => void;
}

export function RecentSearches({searches, onSelect}: RecentSearchesProps) {
  if (searches.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold text-gray-800 mb-3">Recent Searches</h2>
      <div className="space-y-2">
        {searches.map((item, index) => (
          <button
            key={index}
            onClick={() => onSelect(item)}
            className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-100 rounded-xl transition text-left"
          >
            <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-700">{item}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
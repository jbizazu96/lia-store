"use client";

import {Search, Package} from "lucide-react";
import {SearchResult} from "../types";
import {StoreGroup} from "../types";
import {StoreResult} from "./StoreResult";

interface SearchResultsProps {
  loading: boolean;
  results: SearchResult[];
  groups: StoreGroup[];
  onResultClick: (result: SearchResult) => void;
  onStoreClick: (storeId: string) => void;
}

export function SearchResults({
  loading,
  results,
  groups,
  onResultClick,
  onStoreClick,
}: SearchResultsProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-12">
        <Search className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500 text-lg">No results found</p>
        <p className="text-gray-400 text-sm">Try adjusting your search</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <StoreResult
          key={group.storeId}
          group={group}
          onStoreClick={onStoreClick}
          onProductClick={onResultClick}
        />
      ))}
    </div>
  );
}
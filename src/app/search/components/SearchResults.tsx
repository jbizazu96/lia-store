"use client";

import {SearchResult} from "../types";
import {StoreGroup} from "../types";
import {StoreResult} from "./StoreResult";
import { CustomerPageState } from "@/components/customer/ui/CustomerPageState";
import { CustomerPageSkeleton } from "@/components/customer/ui/CustomerPageSkeleton";

interface SearchResultsProps {
  loading: boolean;
  error?: string | null;
  results: SearchResult[];
  groups: StoreGroup[];
  onStoreClick: (storeId: string) => void;
}

export function SearchResults({
  loading,
  error,
  results,
  groups,
  onStoreClick,
}: SearchResultsProps) {
  if (loading) {
    return (
      <CustomerPageSkeleton variant="search" />
    );
  }

  if (error) {
    return (
      <CustomerPageState
        kind="error"
        title="Search is unavailable"
        description={error}
        action={{
          label: "Try again",
          onClick: () => window.location.reload(),
        }}
        compact
      />
    );
  }

  if (results.length === 0) {
    return (
      <CustomerPageState
        kind="search-empty"
        title="No matches yet"
        description="Try a store name, product name, or a different spelling."
        compact
      />
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <StoreResult
          key={group.storeId}
          group={group}
          onStoreClick={onStoreClick}
        />
      ))}
    </div>
  );
}

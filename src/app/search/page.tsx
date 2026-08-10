"use client";

/*
  Search page with real Firestore queries.
  Searches products and stores from the database.
  Shows only matching products, not all products from the store.
*/

import {Suspense, useState, useEffect} from "react";
import {useRouter, useSearchParams} from "next/navigation";
import {auth} from "@/lib/firebase";
import {customerProfileClientService} from "@/services/user/customerProfileClientService";

// Components
import {SearchHeader} from "./components/SearchHeader";
import {RecentSearches} from "./components/RecentSearches";
import {SearchResults} from "./components/SearchResults";
import {SearchResult, StoreGroup} from "./types";

// Services
import {performSearch, groupResultsByStore, searchStoresByName} from "./services/searchService";
import {loadRecentSearches, saveRecentSearch} from "./services/recentSearchService";
import {useMarketplacePricingPolicy} from "@/hooks/useMarketplacePricingPolicy";
import {BrandedLoader} from "@/components/ui/BrandedLoader";

function SearchPageContent() {
  const marketplacePolicy = useMarketplacePricingPolicy();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q")?.trim() ?? "");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [groups, setGroups] = useState<StoreGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [userLocation, setUserLocation] = useState<{lat: number; lng: number} | null>(null);

  // Load user data
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const user = auth.currentUser;
        if (user) {
          const profile = await customerProfileClientService.getProfile();
          if (profile.recentSearches.length > 0) {
            setRecentSearches(profile.recentSearches);
          }
          if (profile.defaultAddress) {
            setUserLocation({
              lat: profile.defaultAddress.latitude,
              lng: profile.defaultAddress.longitude,
            });
          }
        }
        const localSearches = await loadRecentSearches();
        if (localSearches.length > 0) {
          setRecentSearches((current) =>
            current.length > 0 ? current : localSearches
          );
        }
      } catch (error) {
        console.error("Error loading user data:", error);
      }
    };
    loadUserData();
  }, []);

  // Handle search
  useEffect(() => {
    const normalizedQuery = searchQuery.trim();

    if (normalizedQuery.length < 2) {
      queueMicrotask(() => {
        setLoading(false);
        setSearchError(null);
        setResults([]);
        setGroups([]);
      });
      return;
    }

    /*
     * Set loading before the debounce window and while marketplace pricing is
     * still loading. Otherwise SearchResults receives an empty array first
     * and flashes "No results found" before a real search has even started.
     */
    queueMicrotask(() => {
      setLoading(true);
      setSearchError(null);
    });

    if (!marketplacePolicy) {
      return;
    }

    let active = true;

    const timer = setTimeout(() => {
      const runSearch = async () => {
        try {
          // Search both products and stores.
          const [productResults, storeResults] = await Promise.all([
            performSearch(normalizedQuery, userLocation, marketplacePolicy),
            searchStoresByName(normalizedQuery, userLocation, marketplacePolicy),
          ]);

          if (!active) {
            return;
          }

          // Product matches are grouped under their store. A direct store
          // match is added as a store-only group instead of a fake product.
          const combinedResults = [...productResults, ...storeResults];
          const groupedProducts = groupResultsByStore(productResults);
          const groupsByStore = new Map(
            groupedProducts.map((group) => [
              group.storeId,
              group,
            ])
          );

          storeResults.forEach((store) => {
            const existing = groupsByStore.get(store.storeId);

            if (existing) {
              existing.matchesStore = true;
              return;
            }

            groupsByStore.set(store.storeId, {
              storeId: store.storeId,
              storeName: store.storeName,
              storeRating: store.storeRating,
              storeDistance: store.storeDistance,
              deliveryFee: store.deliveryFee,
              estimatedTime: store.estimatedTime,
              storeLogo: store.storeLogo,
              isOpen: store.storeIsOpen === true,
              storeAddress: store.storeAddress || "",
              storePhone: store.storePhone || "",
              storeLatitude: store.storeLatitude || 0,
              storeLongitude: store.storeLongitude || 0,
              matchesStore: true,
              products: [],
            });
          });

          setResults(combinedResults);
          setGroups(Array.from(groupsByStore.values()));
        } catch (error) {
          console.error("Unable to search the marketplace:", error);

          if (active) {
            setResults([]);
            setGroups([]);
            setSearchError(
              "Check your connection and try searching again."
            );
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      };

      void runSearch();
    }, 300);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery, userLocation, marketplacePolicy]);

  const handleClear = () => {
    setSearchQuery("");
    setSearchError(null);
    setResults([]);
    setGroups([]);
  };

  const handleSearchSubmit = () => {
    if (searchQuery.trim()) {
      saveRecentSearch(searchQuery.trim());
    }
  };

  const handleRecentClick = (query: string) => {
    setSearchQuery(query);
    saveRecentSearch(query);
  };

  const handleStoreClick = (storeId: string) => {
    router.push(`/store/${storeId}`);
  };

  const handleBack = () => {
    router.push("/home");
  };

  return (
    <main className="min-h-screen bg-white">
      {/* Search Header */}
      <SearchHeader
        value={searchQuery}
        onChange={setSearchQuery}
        onClear={handleClear}
        onBack={handleBack}
        onSubmit={handleSearchSubmit}
      />

      <div className="max-w-lg mx-auto px-4 py-4">
        {/* Recent Searches */}
        {!searchQuery && (
          <RecentSearches
            searches={recentSearches}
            onSelect={handleRecentClick}
          />
        )}

        {/* Search Results */}
        {searchQuery && (
          <SearchResults
            loading={loading}
            error={searchError}
            results={results}
            groups={groups}
            onStoreClick={handleStoreClick}
          />
        )}
      </div>
    </main>
  );
}

function SearchPageFallback() {
  return <BrandedLoader message="Loading search" />;
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchPageFallback />}>
      <SearchPageContent />
    </Suspense>
  );
}

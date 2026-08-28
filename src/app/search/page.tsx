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
import {enrichSearchResults, groupResultsByStore, searchMarketplacePage} from "./services/searchService";
import {loadRecentSearches, saveRecentSearch} from "./services/recentSearchService";
import {BrandedLoader} from "@/components/ui/BrandedLoader";
import {startCustomerPerformanceTrace} from "@/services/performance/customerPerformanceService";

function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q")?.trim() ?? "");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [groups, setGroups] = useState<StoreGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasCompletedSearch, setHasCompletedSearch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [userLocation, setUserLocation] = useState<{lat: number; lng: number} | null>(null);
  const [locationReady, setLocationReady] = useState(false);
  const [nextProductCursor, setNextProductCursor] = useState<string | null>(null);
  const [nextStoreCursor, setNextStoreCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const buildGroups = (items: SearchResult[]): StoreGroup[] => {
    const productResults = items.filter((result) => result.resultType === "product");
    const storeResults = items.filter((result) => result.resultType === "store");
    const groupsByStore = new Map(
      groupResultsByStore(productResults).map((group) => [group.storeId, group]),
    );
    storeResults.forEach((store) => {
      const existing = groupsByStore.get(store.storeId);
      if (existing) {
        existing.matchesStore = true;
      } else {
        groupsByStore.set(store.storeId, {
          storeId: store.storeId, storeName: store.storeName,
          storeRating: store.storeRating, storeDistance: store.storeDistance,
          deliveryFee: store.deliveryFee, estimatedTime: store.estimatedTime,
          storeLogo: store.storeLogo, isOpen: store.storeIsOpen === true,
          storeAddress: store.storeAddress || "", storePhone: store.storePhone || "",
          storeLatitude: store.storeLatitude || 0, storeLongitude: store.storeLongitude || 0,
          matchesStore: true, products: [],
        });
      }
    });
    return Array.from(groupsByStore.values());
  };

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
      } finally {
        setLocationReady(true);
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
        setHasCompletedSearch(false);
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

    if (!locationReady) return;

    let active = true;

    const timer = setTimeout(() => {
      const runSearch = async () => {
        const searchTrace = startCustomerPerformanceTrace("customer_search_ready");
        try {
          const page = await searchMarketplacePage(normalizedQuery);
          const enrichedResults = await enrichSearchResults(
            [...page.productResults, ...page.storeResults],
            userLocation,
          );

          if (!active) {
            searchTrace.stop({status: "cancelled"});
            return;
          }

          // Product matches are grouped under their store. A direct store
          // match is added as a store-only group instead of a fake product.
          setResults(enrichedResults);
          setGroups(buildGroups(enrichedResults));
          setNextProductCursor(page.nextProductCursor);
          setNextStoreCursor(page.nextStoreCursor);
          setHasMore(page.hasMore);
          setHasCompletedSearch(true);
          searchTrace.stop({status: "success", result_count: String(enrichedResults.length)});
        } catch (error) {
          searchTrace.stop({status: "error"});
          console.error("Unable to search the marketplace:", error);

          if (active) {
            setHasCompletedSearch(true);
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
  }, [locationReady, searchQuery, userLocation]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await searchMarketplacePage(searchQuery, {
        product: nextProductCursor,
        store: nextStoreCursor,
        productDone: nextProductCursor === null,
        storeDone: nextStoreCursor === null,
      });
      const enriched = await enrichSearchResults(
        [...page.productResults, ...page.storeResults], userLocation,
      );
      const byKey = new Map(
        results.map((item) => [`${item.resultType}:${item.id}`, item]),
      );
      enriched.forEach((item) => byKey.set(`${item.resultType}:${item.id}`, item));
      const merged = Array.from(byKey.values());
      setResults(merged);
      setGroups(buildGroups(merged));
      setNextProductCursor(page.nextProductCursor);
      setNextStoreCursor(page.nextStoreCursor);
      setHasMore(page.hasMore);
    } catch (error) {
      console.error("Unable to load more search results:", error);
      setSearchError("More results could not be loaded. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  };

  const handleClear = () => {
    setSearchQuery("");
    setSearchError(null);
    setResults([]);
    setGroups([]);
    setHasMore(false);
    setHasCompletedSearch(false);
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
            hasCompletedSearch={hasCompletedSearch}
            error={searchError}
            results={results}
            groups={groups}
            onStoreClick={handleStoreClick}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={() => void loadMore()}
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

"use client";

/*
  Search page with real Firestore queries.
  Searches products and stores from the database.
  Shows only matching products, not all products from the store.
*/

import {useState, useEffect} from "react";
import {useRouter} from "next/navigation";
import {auth, db} from "@/lib/firebase";
import {doc, getDoc} from "firebase/firestore";

// Components
import {SearchHeader} from "./components/SearchHeader";
import {RecentSearches} from "./components/RecentSearches";
import {SearchResults} from "./components/SearchResults";
import {SearchResult, StoreGroup} from "./types";

// Services
import {performSearch, groupResultsByStore, searchStoresByName} from "./services/searchService";
import {loadRecentSearches, saveRecentSearch} from "./services/recentSearchService";
import {useMarketplacePricingPolicy} from "@/hooks/useMarketplacePricingPolicy";

export default function SearchPage() {
  const marketplacePolicy = useMarketplacePricingPolicy();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [groups, setGroups] = useState<StoreGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [userLocation, setUserLocation] = useState<{lat: number; lng: number} | null>(null);

  // Load user data
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const user = auth.currentUser;
        if (user) {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            if (data.recentSearches) {
              setRecentSearches(data.recentSearches.slice(0, 10));
            }
            if (data.defaultAddress) {
              setUserLocation({
                lat: data.defaultAddress.latitude,
                lng: data.defaultAddress.longitude,
              });
            }
          }
        }
        const localSearches = await loadRecentSearches();
        if (localSearches.length > 0 && recentSearches.length === 0) {
          setRecentSearches(localSearches);
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
      setLoading(false);
      setResults([]);
      setGroups([]);
      return;
    }

    /*
     * Set loading before the debounce window and while marketplace pricing is
     * still loading. Otherwise SearchResults receives an empty array first
     * and flashes "No results found" before a real search has even started.
     */
    setLoading(true);

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
    router.back();
  };

  return (
    <main className="min-h-screen bg-gray-50">
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
            results={results}
            groups={groups}
            onStoreClick={handleStoreClick}
          />
        )}
      </div>
    </main>
  );
}

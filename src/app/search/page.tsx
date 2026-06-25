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

export default function SearchPage() {
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
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length >= 2) {
        setLoading(true);
        
        // ✅ Search both products and stores
        const [productResults, storeResults] = await Promise.all([
          performSearch(searchQuery, userLocation),
          searchStoresByName(searchQuery, userLocation),
        ]);
        
        // Combine results, but prioritize products
        const combinedResults = [...productResults, ...storeResults];
        setResults(combinedResults);
        setGroups(groupResultsByStore(combinedResults));
        setLoading(false);
      } else {
        setResults([]);
        setGroups([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, userLocation]);

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

  const handleResultClick = (result: SearchResult) => {
    router.push(`/store/${result.storeId}?product=${result.id}`);
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
            onResultClick={handleResultClick}
            onStoreClick={handleStoreClick}
          />
        )}
      </div>
    </main>
  );
}
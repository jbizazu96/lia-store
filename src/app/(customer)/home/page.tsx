"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { Store } from "@/types/store";
import { TopNavigation } from "./components/TopNavigation";
import { SearchBar } from "./components/SearchBar";
import { PromoCarousel } from "./components/PromoCarousel";
import { StoreCard } from "./components/StoreCard";
import { StoreCardSkeleton } from "./components/StoreCardSkeleton";
import { DistanceWarningModal } from "./components/DistanceWarningModal";
import { calculateDistance } from "@/services/delivery/distance";

export default function CustomerHomePage() {
  const router = useRouter();
  const [userName, setUserName] = useState("Guest");
  const [userLocation, setUserLocation] = useState<{lat: number; lng: number} | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [nearbyStores, setNearbyStores] = useState<Store[]>([]);
  const [farStores, setFarStores] = useState<Store[]>([]);
  const [filteredNearby, setFilteredNearby] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const endOfListRef = useRef<HTMLDivElement>(null);

  // Distance warning modal state
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [selectedDistance, setSelectedDistance] = useState(0);
  const [showDistanceWarning, setShowDistanceWarning] = useState(false);

  // Get current user
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserName(data.displayName || user.email?.split("@")[0] || "Customer");
          
          if (data.defaultAddress) {
            setUserLocation({
              lat: data.defaultAddress.latitude,
              lng: data.defaultAddress.longitude,
            });
          }
        }
      } else {
        router.push("/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Fetch stores
  useEffect(() => {
    const fetchStores = async () => {
      try {
        setLoading(true);
        const storesRef = collection(db, "stores");
        const snapshot = await getDocs(storesRef);
        
        const storesData: Store[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          storesData.push({
            id: doc.id,
            ...data,
          } as Store);
        });
        
        let storesWithDistance = storesData;
        if (userLocation) {
          storesWithDistance = storesData.map(store => ({
            ...store,
            distance: calculateDistance(
              userLocation.lat,
              userLocation.lng,
              store.latitude,
              store.longitude
            ),
          }));
        }
        
        // Sort by distance (closest first)
        storesWithDistance.sort((a, b) => (a.distance || 999) - (b.distance || 999));
        
        // Filter only active stores
        const activeStores = storesWithDistance.filter(store => 
          store.status === "active" && store.isOpen
        );
        
        setStores(activeStores);
        
        // Split stores into nearby (≤25mi) and far (>25mi)
        const nearby = activeStores.filter(store => (store.distance || 0) <= 25);
        const far = activeStores.filter(store => (store.distance || 0) > 25);
        
        setNearbyStores(nearby);
        setFarStores(far);
        setFilteredNearby(nearby);
      } catch (error) {
        console.error("Error fetching stores:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStores();
  }, [userLocation]);

  // Handle search
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredNearby(nearbyStores);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = nearbyStores.filter(store =>
        store.name.toLowerCase().includes(query) ||
        store.description?.toLowerCase().includes(query) ||
        store.city?.toLowerCase().includes(query) ||
        store.category?.toLowerCase().includes(query)
      );
      setFilteredNearby(filtered);
    }
  }, [searchQuery, nearbyStores]);

  // Handle store click
  const handleStoreClick = (store: Store) => {
    const distance = store.distance || 0;
    const maxRadius = 25;
    
    if (distance > maxRadius) {
      setSelectedStore(store);
      setSelectedDistance(distance);
      setShowDistanceWarning(true);
    } else {
      router.push(`/store/${store.id}`);
    }
  };

  // Handle continue from warning modal
  const handleContinueToStore = () => {
    if (selectedStore) {
      setShowDistanceWarning(false);
      router.push(`/store/${selectedStore.id}`);
    }
  };

  /* ==========================================
     LOADING STATE - WHITE BRANDED LOADER
  ========================================== */
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col justify-center items-center relative overflow-hidden">
        
        {/* Ambient Glows (Soft Yellow accents on white background) */}
        <div className="absolute top-0 right-0 h-[500px] w-[500px] rounded-full bg-yellow-400/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 h-[400px] w-[400px] rounded-full bg-blue-500/5 blur-[100px] pointer-events-none" />

        {/* Centered Loader */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center justify-center p-8 relative z-10"
        >
          
          {/* Logo Orbiting Container */}
          <div className="relative w-28 h-28 mb-8 flex items-center justify-center">
            
            {/* Dotted Orbit Ring */}
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 rounded-full border-2 border-dashed border-yellow-400/30"
            />
            
            {/* Inner Ring */}
            <motion.div 
              animate={{ rotate: -360 }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="absolute inset-2 rounded-full border border-yellow-400/10"
            />
            
            {/* Rotating glowing dots */}
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0"
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.8)]" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 rounded-full bg-yellow-400/40" />
              <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-yellow-400/40" />
              <div className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-yellow-400/40" />
            </motion.div>

            {/* Central Logo Image */}
            <div className="relative w-16 h-16 z-10 bg-white/80 backdrop-blur-md rounded-full border-2 border-yellow-400/50 shadow-[0_0_30px_rgba(234,179,8,0.15)] flex items-center justify-center overflow-hidden">
              <img 
                src="/icon/icon-192.png" 
                alt="LIA Logo" 
                className="w-12 h-12 object-contain" 
              />
            </div>
          </div>

          {/* Loading Text */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="text-center"
          >
            <h3 className="text-lg font-medium text-gray-600 mb-1 tracking-wide opacity-100">
              Loading stores
            </h3>
            <div className="flex items-center justify-center gap-1 mt-2">
              
              {/* Dot 1 */}
              <motion.span 
                initial={{ opacity: 0.5 }} 
                animate={{ opacity: [0.5, 1, 0.5] }} 
                transition={{ duration: 1.5, repeat: Infinity, delay: 0 }} 
                className="w-1.5 h-1.5 rounded-full bg-yellow-400"
              />
              
              {/* Dot 2 */}
              <motion.span 
                initial={{ opacity: 0.5 }} 
                animate={{ opacity: [0.5, 1, 0.5] }} 
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }} 
                className="w-1.5 h-1.5 rounded-full bg-yellow-400"
              />
              
              {/* Dot 3 */}
              <motion.span 
                initial={{ opacity: 0.5 }} 
                animate={{ opacity: [0.5, 1, 0.5] }} 
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.6 }} 
                className="w-1.5 h-1.5 rounded-full bg-yellow-400"
              />
            </div>
          </motion.div>
          
        </motion.div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-4">
      {/* Top Navigation */}
      <TopNavigation userName={userName} showSearch={false} />

      {/* Welcome Section */}
      <div className="px-4 pt-4 pb-2">
        <p className="text-sm text-gray-500">Hello,</p>
        <h1 className="text-2xl font-bold text-gray-800">{userName}</h1>
      </div>

      {/* Search Bar */}
      <div className="px-4 mt-2">
        <SearchBar 
          value={searchQuery} 
          onChange={setSearchQuery} 
          placeholder="Search stores..."
        />
      </div>

      {/* Promo Carousel */}
      <div className="px-4 mt-4">
        <PromoCarousel />
      </div>

      {/* Store List */}
      <section className="px-4 mt-6 pb-32">
        {nearbyStores.length === 0 && farStores.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 text-gray-300 mx-auto mb-4">🏪</div>
            <p className="text-gray-500">No stores found</p>
            <p className="text-sm text-gray-400">Try adjusting your search</p>
          </div>
        ) : (
          <>
            {/* Nearby Stores Section */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Stores Near You</h2>
              <span className="text-sm text-gray-500">{filteredNearby.length} stores</span>
            </div>

            <AnimatePresence mode="popLayout">
              {filteredNearby.map((store, index) => (
                <motion.div
                  key={store.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <StoreCard 
                    store={store} 
                    onClick={() => handleStoreClick(store)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Divider between nearby and far stores */}
            {farStores.length > 0 && !searchQuery && (
              <div className="mt-8 mb-6">
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-gray-200" />
                  <div className="flex items-center gap-2 text-xs text-gray-400 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                    <span>Stores beyond 25 miles</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                  </div>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
                <p className="text-xs text-gray-400 text-center mt-1.5">
                  These stores are available but outside your delivery radius
                </p>
              </div>
            )}

            {/* Far Stores Section */}
            {farStores.length > 0 && !searchQuery && (
              <div className="space-y-4 mt-2">
                {farStores.map((store, index) => (
                  <motion.div
                    key={store.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 + 0.2 }}
                  >
                    <StoreCard 
                      store={store} 
                      onClick={() => handleStoreClick(store)}
                    />
                  </motion.div>
                ))}
              </div>
            )}

            {/* End of List Indicator */}
            {!loading && (
              <div ref={endOfListRef} className="mt-10 text-center">
                <div className="flex items-center gap-3 justify-center">
                  <div className="flex-1 max-w-12 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400">— You've reached the end —</span>
                  <div className="flex-1 max-w-12 h-px bg-gray-200" />
                </div>
                <p className="text-xs text-gray-300 mt-2">
                  🛒 No more stores to show
                </p>
              </div>
            )}
          </>
        )}
      </section>

      {/* Distance Warning Modal */}
      <AnimatePresence>
        {showDistanceWarning && selectedStore && (
          <DistanceWarningModal
            store={selectedStore}
            distance={selectedDistance}
            onClose={() => setShowDistanceWarning(false)}
            onContinue={handleContinueToStore}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
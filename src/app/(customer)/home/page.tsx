"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  getDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import type { CustomerStore } from "@/types/view-models/customerStore";
import { DELIVERY_CONFIG } from "@/config/delivery";
import { storeMapper } from "@/mappers/storeMapper";
import { storeService } from "@/services/store/storeService";
import {
  calculateDeliveryFee,
  getDeliveryFeeDisplay,
} from "@/services/delivery/deliveryPricing";
import {
  calculateDistance,
  getEstimatedTime,
  getEstimatedTimeNumber,
} from "@/services/delivery/distance";
import { TopNavigation } from "@/components/customer/home/TopNavigation";
import { SearchBar } from "@/components/customer/home/SearchBar";
import { PromoCarousel } from "@/components/customer/home/PromoCarousel";
import { StoreCard } from "@/components/customer/home/StoreCard";
import { DistanceWarningModal } from "@/components/customer/home/DistanceWarningModal";
import { FloatingCart } from "@/components/customer/home/FloatingCart";
import { useCart } from "@/context/CartContext";
import { BrandedLoader } from "@/components/ui/BrandedLoader";

export default function CustomerHomePage() {
  const router = useRouter();
  const { itemCount, totalPrice } = useCart();
  const [userName, setUserName] = useState("Guest");
  const [userLocation, setUserLocation] = useState<{lat: number; lng: number} | null>(null);
  const [nearbyStores, setNearbyStores] = useState<CustomerStore[]>([]);
  const [farStores, setFarStores] = useState<CustomerStore[]>([]);
  const [filteredNearby, setFilteredNearby] = useState<CustomerStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const endOfListRef = useRef<HTMLDivElement>(null);

  // Distance warning modal state
  const [selectedStore, setSelectedStore] = useState<CustomerStore | null>(null);
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
        const storesData = await storeService.getStores();

          const storesWithDistance: CustomerStore[] = storesData.map((store) => {
            const distance = userLocation
              ? calculateDistance(
                  userLocation.lat,
                  userLocation.lng,
                  store.latitude,
                  store.longitude
                )
              : 0;

            const pricing = calculateDeliveryFee(distance, 0);

            return storeMapper.toCustomerStore(store, {
              distance,

              deliveryFee: pricing.deliveryFee,
              deliveryFeeDisplay: getDeliveryFeeDisplay(distance),

              estimatedPrepTime: getEstimatedTimeNumber(distance),
              estimatedDeliveryTime: getEstimatedTime(distance),

              reviewCount: 0,
              categories: [],
              promotions: [],
              isFavorite: false,
            });
          });
        // Sort by distance (closest first)
        storesWithDistance.sort((a, b) => (a.distance || 999) - (b.distance || 999));
        
        // Filter only active stores
        const activeStores = storesWithDistance.filter(store => 
          store.status === "active" && store.isOpen
        );
        
        // Split stores into nearby (≤25mi) and far (>25mi)
        const nearby = activeStores.filter(
          (store) =>
            store.distance <= DELIVERY_CONFIG.MAX_RADIUS_MILES
        );

        const far = activeStores.filter(
          (store) =>
            store.distance > DELIVERY_CONFIG.MAX_RADIUS_MILES
        );
        
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
  const handleStoreClick = (store: CustomerStore) => {
    const distance = store.distance || 0;
    const maxRadius = DELIVERY_CONFIG.MAX_RADIUS_MILES;
    
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

  // Navigate to cart
  const handleCartClick = () => {
    router.push("/cart");
  };

  if (loading) {
    return <BrandedLoader message="Loading Home" />;
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-20">
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
      <section className="px-4 mt-6">
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
                    <span>
                        Stores beyond {DELIVERY_CONFIG.MAX_RADIUS_MILES} miles
                      </span>
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

      {/* ✅ Floating Cart Component */}
      <FloatingCart
        itemCount={itemCount}
        totalPrice={totalPrice}
        onClick={handleCartClick}
      />

      {/* Distance Warning Modal */}
      <AnimatePresence>
        {showDistanceWarning && selectedStore && (
          <DistanceWarningModal
            distance={selectedDistance}
            onClose={() => setShowDistanceWarning(false)}
            onContinue={handleContinueToStore}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

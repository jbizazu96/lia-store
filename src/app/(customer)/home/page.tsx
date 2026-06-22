"use client";

import {useState, useEffect} from "react";
import {useRouter} from "next/navigation";
import {motion, AnimatePresence} from "framer-motion";
import {auth, db} from "@/lib/firebase";
import {doc, getDoc, collection, getDocs} from "firebase/firestore";
import {onAuthStateChanged} from "firebase/auth";
import {Store} from "@/types/store";
import {Header} from "./components/Header";
import {SearchBar} from "./components/SearchBar";
import {PromoCarousel} from "./components/PromoCarousel";
import {StoreCard} from "./components/StoreCard";
import {StoreCardSkeleton} from "./components/StoreCardSkeleton";
import {DistanceWarningModal} from "./components/DistanceWarningModal";
import {calculateDistance, getDeliveryStatusMessage} from "@/services/distance";

export default function CustomerHomePage() {
  const router = useRouter();
  const [userName, setUserName] = useState("Guest");
  const [userLocation, setUserLocation] = useState<{lat: number; lng: number} | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [filteredStores, setFilteredStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [cartCount, setCartCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

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
          
          // Get user's default address location
          if (data.defaultAddress) {
            setUserLocation({
              lat: data.defaultAddress.latitude,
              lng: data.defaultAddress.longitude,
            });
          }
        }
        
        const savedCart = localStorage.getItem(`cart_${user.uid}`);
        if (savedCart) {
          try {
            const cart = JSON.parse(savedCart);
            setCartCount(cart.length || 0);
          } catch {
            setCartCount(0);
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
        
        // Calculate distance for each store if user location is available
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
        setFilteredStores(activeStores);
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
      setFilteredStores(stores);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = stores.filter(store =>
        store.name.toLowerCase().includes(query) ||
        store.description?.toLowerCase().includes(query) ||
        store.city?.toLowerCase().includes(query) ||
        store.category?.toLowerCase().includes(query)
      );
      setFilteredStores(filtered);
    }
  }, [searchQuery, stores]);

  // Handle store click
  const handleStoreClick = (store: Store) => {
    const distance = store.distance || 0;
    const maxRadius = 25;
    
    // Check if store is within radius
    if (distance > maxRadius) {
      setSelectedStore(store);
      setSelectedDistance(distance);
      setShowDistanceWarning(true);
    } else {
      // If within radius, go directly to store
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

  return (
    <main className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <Header userName={userName} cartCount={cartCount} />

      {/* Search Bar */}
      <div className="px-4 mt-4">
        <SearchBar 
          value={searchQuery} 
          onChange={setSearchQuery} 
        />
      </div>

      {/* Promo Carousel */}
      <div className="px-4 mt-4">
        <PromoCarousel />
      </div>

      {/* Store List */}
      <section className="px-4 mt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800">Stores Near You</h2>
          <span className="text-sm text-gray-500">{filteredStores.length} stores</span>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <StoreCardSkeleton key={i} />
            ))}
          </div>
        ) : filteredStores.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 text-gray-300 mx-auto mb-4">🏪</div>
            <p className="text-gray-500">No stores found</p>
            <p className="text-sm text-gray-400">Try adjusting your search</p>
          </div>
        ) : (
          <motion.div 
            className="space-y-4"
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            transition={{duration: 0.3}}
          >
            {filteredStores.map((store, index) => (
              <motion.div
                key={store.id}
                initial={{opacity: 0, y: 20}}
                animate={{opacity: 1, y: 0}}
                transition={{delay: index * 0.05}}
              >
                <StoreCard 
                  store={store} 
                  onClick={() => handleStoreClick(store)}
                />
              </motion.div>
            ))}
          </motion.div>
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
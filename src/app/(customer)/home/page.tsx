"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import type { CustomerStore } from "@/types/view-models/customerStore";
import type { Store } from "@/types/store";
import { storeMapper } from "@/mappers/storeMapper";
import { storeService } from "@/services/store/storeService";
import { isStoreCustomerVisible } from "@/services/store/storeAvailability";
import {
  calculateDeliveryFee,
  getDeliveryFeeDisplay,
} from "@/services/delivery/deliveryPricing";
import {
  getEstimatedTime,
  getEstimatedTimeNumber,
} from "@/services/delivery/distance";
import {
  hasValidRouteCoordinates,
} from "@/services/delivery/routing";
import {
  getStoreDeliveryRoutes,
} from "@/services/delivery/deliveryRoutesClientService";
import { userService } from "@/services/user/userService";
import {
  customerProfileClientService,
  type CustomerProfileAddress,
} from "@/services/user/customerProfileClientService";
import { TopNavigation } from "@/components/customer/home/TopNavigation";
import { SearchBar } from "@/components/customer/home/SearchBar";
import { PromoCarousel } from "@/components/customer/home/PromoCarousel";
import { StoreCard } from "@/components/customer/home/StoreCard";
import { DistanceWarningModal } from "@/components/customer/home/DistanceWarningModal";
import { FloatingCart } from "@/components/customer/home/FloatingCart";
import { CustomerBottomNavigation } from "@/components/customer/navigation/CustomerBottomNavigation";
import { useCart } from "@/context/CartContext";
import { CustomerPageState } from "@/components/customer/ui/CustomerPageState";
import { CustomerPageSkeleton } from "@/components/customer/ui/CustomerPageSkeleton";
import {useMarketplacePricingPolicy} from "@/hooks/useMarketplacePricingPolicy";
import {useOrderDeliveryPolicy} from "@/hooks/useOrderDeliveryPolicy";
import { useCustomerFavoriteStores } from "@/hooks/useCustomerFavoriteStores";
import { Heart } from "lucide-react";
import { AddressesModal } from "@/components/customer/profile/AddressesModal";

export default function CustomerHomePage() {
  const marketplacePolicy = useMarketplacePricingPolicy();
  const orderDeliveryPolicy = useOrderDeliveryPolicy();
  const router = useRouter();
  const { itemCount, totalPrice } = useCart();
  const [userName, setUserName] = useState("Guest");
  const [deliveryAddress, setDeliveryAddress] =
    useState<CustomerProfileAddress | null>(null);
  const [userLocation, setUserLocation] = useState<{lat: number; lng: number} | null>(null);
  const [locationReady, setLocationReady] = useState(false);
  const [distanceError, setDistanceError] = useState<string | null>(null);
  const [nearbyStores, setNearbyStores] = useState<CustomerStore[]>([]);
  const [farStores, setFarStores] = useState<CustomerStore[]>([]);
  const [storeFilter, setStoreFilter] = useState<"all" | "favorites">("all");
  const [loading, setLoading] = useState(true);
  const endOfListRef = useRef<HTMLDivElement>(null);

  // Distance warning modal state
  const [selectedStore, setSelectedStore] = useState<CustomerStore | null>(null);
  const [selectedDistance, setSelectedDistance] = useState(0);
  const [showDistanceWarning, setShowDistanceWarning] = useState(false);
  const [showAddresses, setShowAddresses] = useState(false);
  const {
    storeIds: favoriteStoreIds,
    isFavorite,
    setFavorite,
  } = useCustomerFavoriteStores();

  const favoriteStoreIdSet = useMemo(
    () => new Set(favoriteStoreIds),
    [favoriteStoreIds]
  );

  const displayedNearbyStores = useMemo(
    () => nearbyStores
      .map((store) => ({
        ...store,
        isFavorite: favoriteStoreIdSet.has(store.id),
      }))
      .filter((store) =>
        storeFilter === "all" || store.isFavorite
      ),
    [
      favoriteStoreIdSet,
      nearbyStores,
      storeFilter,
    ]
  );

  const displayedFarStores = useMemo(
    () => farStores
      .map((store) => ({
        ...store,
        isFavorite: favoriteStoreIdSet.has(store.id),
      }))
      .filter((store) =>
        storeFilter === "all" || store.isFavorite
      ),
    [
      favoriteStoreIdSet,
      farStores,
      storeFilter,
    ]
  );

  // Get current user
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      try {
        const profile = await customerProfileClientService.getProfile();
        setUserName(profile.displayName || user.email?.split("@")[0] || "Customer");
        setDeliveryAddress(profile.defaultAddress);

        const location = await userService.getDefaultLocation(user.uid);

        if (location) {
          setUserLocation(location);
        } else {
          setDistanceError(
            "Add a verified delivery address to see driving distances and available delivery."
          );
        }
      } catch (error) {
        console.error("Unable to load the customer delivery location:", error);
        setDistanceError(
          "We could not load your delivery address. Please try again."
        );
      } finally {
        setLocationReady(true);
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Keep customer store discovery synchronized with newly activated stores.
  useEffect(() => {
    let isMounted = true;
    let latestRequest = 0;

    const updateStores = async (storesData: Store[]) => {
      if (!locationReady || !marketplacePolicy) {
        return;
      }

      if (!userLocation) {
        setNearbyStores([]);
        setFarStores([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setDistanceError(null);
        const requestId = ++latestRequest;

        const storesWithCoordinates =
          storesData.filter((store) =>
            isStoreCustomerVisible(store) &&
            hasValidRouteCoordinates({
              latitude: store.latitude,
              longitude: store.longitude,
            })
          );

        const routes =
          storesWithCoordinates.length > 0
            ? await getStoreDeliveryRoutes(
                storesWithCoordinates.map(
                  (store) => store.id
                ),
                {
                  latitude: userLocation.lat,
                  longitude: userLocation.lng,
                }
              )
            : [];

        if (!isMounted || requestId !== latestRequest) {
          return;
        }

        const routeByStoreId = new Map(
          routes.map((route) => [
            route.storeId,
            route.distanceMiles,
          ])
        );

        const calculatedStores =
          storesWithCoordinates.map((store) => {
            const distance = routeByStoreId.get(
              store.id
            );

            if (distance === undefined) {
              return null;
            }

            const pricing = calculateDeliveryFee(distance, 0, marketplacePolicy);

            return storeMapper.toCustomerStore(store, {
              distance,
              deliveryFee: pricing.deliveryFee,
              deliveryFeeDisplay: getDeliveryFeeDisplay(distance, marketplacePolicy),
              estimatedPrepTime: getEstimatedTimeNumber(distance, orderDeliveryPolicy),
              estimatedDeliveryTime: getEstimatedTime(distance, orderDeliveryPolicy),
              categories: [],
              promotions: [],
              isFavorite: false,
            });
          });

        const storesWithDistance = calculatedStores.filter(
          (store): store is CustomerStore => store !== null
        );

        /*
          Only compare routes against the stores actually submitted to
          Google Routes. Pending, suspended, inactive, or ungeocoded stores
          are intentionally excluded before the request and must not trigger
          a misleading delivery-distance warning.
        */
        if (storesWithDistance.length !== storesWithCoordinates.length) {
          setDistanceError(
            "Some stores could not be shown because their delivery distance could not be calculated."
          );
        }

        // Sort by distance (closest first)
        storesWithDistance.sort((a, b) => a.distance - b.distance);
        
        // Closed stores remain visible; their card displays the current schedule.
        const activeStores = storesWithDistance.filter(store => 
          isStoreCustomerVisible(store)
        );
        
        // Split stores into nearby (≤25mi) and far (>25mi)
        const nearby = activeStores.filter(
          (store) =>
            store.distance <= marketplacePolicy.maxRadiusMiles
        );

        const far = activeStores.filter(
          (store) =>
            store.distance > marketplacePolicy.maxRadiusMiles
        );
        
        if (isMounted && requestId === latestRequest) {
          setNearbyStores(nearby);
          setFarStores(far);
        }
      } catch (error) {
        console.error("Error fetching stores:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    if (!locationReady || !userLocation) {
      void updateStores([]);
      return () => {
        isMounted = false;
      };
    }

    const unsubscribe = storeService.listenToStores(
      (stores) => {
        void updateStores(stores);
      },
      (error) => {
        console.error("Error listening to stores:", error);
        if (isMounted) {
          setLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [locationReady, userLocation, marketplacePolicy, orderDeliveryPolicy]);

  // Handle store click
  const handleStoreClick = (store: CustomerStore) => {
    const distance = store.distance;
    const maxRadius = marketplacePolicy?.maxRadiusMiles ?? 0;
    
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
      const searchParams = new URLSearchParams({
        distance: String(selectedStore.distance),
        deliveryFee: String(selectedStore.deliveryFee),
        estimatedTime: String(selectedStore.estimatedPrepTime),
        skipDistanceWarning: "1",
      });

      router.push(`/store/${selectedStore.id}?${searchParams.toString()}`);
    }
  };

  // Navigate to cart
  const handleCartClick = () => {
    router.push("/cart");
  };

  const handleDeliveryAddressChange = (
    address: CustomerProfileAddress | null
  ) => {
    setDeliveryAddress(address);

    if (address) {
      setUserLocation({
        lat: address.latitude,
        lng: address.longitude,
      });
      setDistanceError(null);
      return;
    }

    setUserLocation(null);
    setDistanceError(
      "Add a verified delivery address to see driving distances and available delivery."
    );
  };

  if (loading) {
    return <CustomerPageSkeleton variant="home" />;
  }

  return (
    <main className="min-h-screen bg-white pb-28">
      {/* Top Navigation */}
      <TopNavigation
        deliveryAddress={deliveryAddress?.street}
        onDeliveryAddressClick={() => setShowAddresses(true)}
      />

      {/* Welcome Section */}
      <div className="px-4 pt-4 pb-2">
        <p className="text-sm text-gray-500">Hello,</p>
        <h1 className="text-2xl font-bold text-gray-800">{userName}</h1>
      </div>

      {/* Sticky global search remains in its original place below welcome. */}
      <div className="sticky top-[65px] z-30 mt-2 bg-white/95 px-4 py-2 backdrop-blur-sm">
        <SearchBar
          onOpen={() => router.push("/search")}
          placeholder="Search stores and products"
        />
      </div>

      {/* Promo Carousel */}
      <div className="px-4 mt-4">
        <PromoCarousel />
      </div>

      {distanceError && (
        <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {distanceError}
        </div>
      )}

      {/* Store List */}
      <section className="px-4 mt-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-800">
              {storeFilter === "favorites"
                ? "Saved stores"
                : "Stores Near You"}
            </h2>
            <p className="text-sm text-gray-500">
              {storeFilter === "favorites"
                ? `${displayedNearbyStores.length + displayedFarStores.length} saved`
                : `${nearbyStores.length + farStores.length} stores`}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setStoreFilter((current) =>
              current === "all" ? "favorites" : "all"
            )}
            className={
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-bold transition " +
              (storeFilter === "favorites"
                ? "border-orange-400 text-orange-600"
                : "border-gray-200 bg-white/60 text-gray-700 hover:border-orange-200")
            }
          >
            <Heart className={
              "h-4 w-4 " +
              (storeFilter === "favorites"
                ? "fill-orange-500 text-orange-500"
                : "text-gray-500")
            } />
            Favorites
          </button>
        </div>

        {displayedNearbyStores.length === 0 && displayedFarStores.length === 0 ? (
          <CustomerPageState
            kind="empty"
            title={
              storeFilter === "favorites"
                ? "No saved stores yet"
                : "No stores available"
            }
            description={
              storeFilter === "favorites"
                ? "Tap the heart on a store to save it here for quick access."
                : "Try changing your delivery address or check back soon."
            }
            compact
          />
        ) : (
          <>
            <AnimatePresence mode="popLayout">
              {displayedNearbyStores.map((store, index) => (
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
                    onFavoriteChange={setFavorite}
                  />
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Divider between nearby and far stores */}
            {displayedFarStores.length > 0 && (
              <div className="mt-8 mb-6">
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-gray-200" />
                  <div className="flex items-center gap-2 text-xs text-gray-400 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                    <span>
                        Stores beyond {marketplacePolicy?.maxRadiusMiles ?? "…"} miles
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
            {displayedFarStores.length > 0 && (
              <div className="space-y-4 mt-2">
                {displayedFarStores.map((store, index) => (
                  <motion.div
                    key={store.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 + 0.2 }}
                  >
                    <StoreCard
                      store={store}
                    onClick={() => handleStoreClick(store)}
                    onFavoriteChange={setFavorite}
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

      <CustomerBottomNavigation />

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

      <AnimatePresence>
        {showAddresses && (
          <AddressesModal
            onClose={() => setShowAddresses(false)}
            onAddressChange={handleDeliveryAddressChange}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

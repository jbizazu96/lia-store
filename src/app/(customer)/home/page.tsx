"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import type { CustomerStore } from "@/types/view-models/customerStore";
import type { Store } from "@/types/store";
import { storeMapper } from "@/mappers/storeMapper";
import { storeService } from "@/services/store/storeService";
import type { StoreCatalogCursor } from "@/services/store/storeService";
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
  getCachedStoreDeliveryRoutes,
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
import { FloatingCart } from "@/components/customer/home/FloatingCart";
import { CustomerBottomNavigation } from "@/components/customer/navigation/CustomerBottomNavigation";
import { useCart } from "@/context/CartContext";
import { CustomerPageState } from "@/components/customer/ui/CustomerPageState";
import { CustomerPageSkeleton } from "@/components/customer/ui/CustomerPageSkeleton";
import { useCustomerFavoriteStores } from "@/hooks/useCustomerFavoriteStores";
import { Heart, ShoppingBag, Sparkles } from "lucide-react";
import { MarketplaceCategoryNav } from "@/components/customer/home/MarketplaceCategoryNav";
import {marketplacePricingClientService} from "@/services/pricing/marketplacePricingClientService";
import type {MarketplacePricingPolicy} from "@/services/pricing/marketplacePricingClientService";
import {startCustomerPerformanceTrace} from "@/services/performance/customerPerformanceService";

const DistanceWarningModal = dynamic(
  () => import("@/components/customer/home/DistanceWarningModal").then((module) => module.DistanceWarningModal),
  {ssr: false},
);
const AddressesModal = dynamic(
  () => import("@/components/customer/profile/AddressesModal").then((module) => module.AddressesModal),
  {ssr: false},
);

export default function CustomerHomePage() {
  const router = useRouter();
  const { itemCount, totalPrice } = useCart();
  const [userName, setUserName] = useState("Customer");
  const [deliveryAddress, setDeliveryAddress] =
    useState<CustomerProfileAddress | null>(null);
  const [userLocation, setUserLocation] = useState<{lat: number; lng: number} | null>(null);
  const [locationReady, setLocationReady] = useState(false);
  const [distanceError, setDistanceError] = useState<string | null>(null);
  const [nearbyStores, setNearbyStores] = useState<CustomerStore[]>([]);
  const [farStores, setFarStores] = useState<CustomerStore[]>([]);
  const [storeFilter, setStoreFilter] = useState<"all" | "favorites">("all");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deliveryDetailsLoading, setDeliveryDetailsLoading] = useState(false);
  const [catalogStores, setCatalogStores] = useState<Store[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [marketplacePolicy, setMarketplacePolicy] = useState<MarketplacePricingPolicy | null>(null);
  const [storeCursor, setStoreCursor] = useState<StoreCatalogCursor | null>(null);
  const [hasMoreStores, setHasMoreStores] = useState(false);
  const [loadingMoreStores, setLoadingMoreStores] = useState(false);
  const endOfListRef = useRef<HTMLDivElement>(null);
  const hasLoadedStoresRef = useRef(false);

  // Distance warning modal state
  const [selectedStore, setSelectedStore] = useState<CustomerStore | null>(null);
  const [selectedDistance, setSelectedDistance] = useState(0);
  const [showDistanceWarning, setShowDistanceWarning] = useState(false);
  const [showAddresses, setShowAddresses] = useState(false);
  const {
    storeIds: favoriteStoreIds,
    setFavorite,
  } = useCustomerFavoriteStores();

  const favoriteStoreIdSet = useMemo(
    () => new Set(favoriteStoreIds),
    [favoriteStoreIds]
  );

  const storeCategories = useMemo(
    () => Array.from(new Set(
      catalogStores
        .map((store) => store.category?.trim())
        .filter((category): category is string => Boolean(category))
    )).sort((first, second) => first.localeCompare(second)),
    [catalogStores]
  );

  const displayedProvisionalStores = useMemo(
    () => catalogStores
      .filter(isStoreCustomerVisible)
      .map((store) => storeMapper.toCustomerStore(store, {
        distance: 0,
        deliveryFee: 0,
        deliveryFeeDisplay: "Calculating…",
        estimatedPrepTime: 0,
        estimatedDeliveryTime: "Calculating…",
        categories: [],
        promotions: [],
        isFavorite: favoriteStoreIdSet.has(store.id),
        maxDeliveryMiles: Number.MAX_SAFE_INTEGER,
        zoneAccessAllowed: true,
        zoneAccessType: "default_pricing",
      }))
      .filter((store) =>
        (storeFilter === "all" || store.isFavorite) &&
        (selectedCategory === null || store.category === selectedCategory)
      ),
    [catalogStores, favoriteStoreIdSet, selectedCategory, storeFilter],
  );

  const displayedNearbyStores = useMemo(
    () => nearbyStores
      .map((store) => ({
        ...store,
        isFavorite: favoriteStoreIdSet.has(store.id),
      }))
      .filter((store) =>
        (storeFilter === "all" || store.isFavorite) &&
        (selectedCategory === null || store.category === selectedCategory)
      ),
    [
      favoriteStoreIdSet,
      nearbyStores,
      selectedCategory,
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
        (storeFilter === "all" || store.isFavorite) &&
        (selectedCategory === null || store.category === selectedCategory)
      ),
    [
      favoriteStoreIdSet,
      farStores,
      selectedCategory,
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

      const profileTrace = startCustomerPerformanceTrace("customer_home_profile");
      try {
        const profile = await customerProfileClientService.getProfile();
        setUserName(
          profile.displayName || user.email?.split("@")[0] || "Customer"
        );
        setDeliveryAddress(profile.defaultAddress);

        const location = await userService.getDefaultLocation(user.uid);

        if (location) {
          setUserLocation(location);
        } else {
          setDistanceError(
            "Add a verified delivery address to see driving distances and available delivery."
          );
        }
        profileTrace.stop({status: "success"});
      } catch (error) {
        console.error("Unable to load the customer delivery location:", error);
        setDistanceError(
          "We could not load your delivery address. Please try again."
        );
        profileTrace.stop({status: "error"});
      } finally {
        setLocationReady(true);
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    let active = true;
    const catalogTrace = startCustomerPerformanceTrace("customer_home_catalog");
    void storeService.getStoresPage(null, 40)
      .then((page) => {
        if (!active) return;
        setCatalogStores(page.stores);
        setStoreCursor(page.nextCursor);
        setHasMoreStores(page.hasMore);
        catalogTrace.stop({
          status: "success",
          store_count: String(page.stores.length),
        });
      })
      .catch((error) => {
        console.error("Unable to load the store catalog:", error);
        if (active) setDistanceError("We could not load stores. Please try again.");
        catalogTrace.stop({status: "error"});
      })
      .finally(() => {
        if (active) setCatalogReady(true);
      });
    return () => {
      active = false;
      catalogTrace.stop({status: "cancelled"});
    };
  }, []);

  const loadMoreStores = async () => {
    if (!storeCursor || !hasMoreStores || loadingMoreStores) return;
    try {
      setLoadingMoreStores(true);
      const page = await storeService.getStoresPage(storeCursor, 40);
      setCatalogStores((current) => {
        const known = new Set(current.map((store) => store.id));
        return [...current, ...page.stores.filter((store) => !known.has(store.id))];
      });
      setStoreCursor(page.nextCursor);
      setHasMoreStores(page.hasMore);
    } catch (error) {
      console.error("Unable to load more stores:", error);
      setDistanceError("We could not load more stores. Please try again.");
    } finally {
      setLoadingMoreStores(false);
    }
  };

  // Keep customer store discovery synchronized with newly activated stores.
  useEffect(() => {
    let isMounted = true;

    const updateStores = async (storesData: Store[]) => {
      if (!locationReady || !catalogReady) {
        return;
      }

      if (!userLocation) {
        setNearbyStores([]);
        setFarStores([]);
        setLoading(false);
        setDeliveryDetailsLoading(false);
        return;
      }

      const homeTrace = startCustomerPerformanceTrace("customer_home_store_discovery");
      try {
        setLoading(false);
        setDeliveryDetailsLoading(true);
        if (storesData.length > 0) {
          setDistanceError(null);
        }
        const storesWithCoordinates =
          storesData.filter((store) =>
            isStoreCustomerVisible(store) &&
            hasValidRouteCoordinates({
              latitude: store.latitude,
              longitude: store.longitude,
            })
          );

        if (storesWithCoordinates.length === 0) {
          if (isMounted) {
            setNearbyStores([]);
            setFarStores([]);
            hasLoadedStoresRef.current = true;
          }
          homeTrace.stop({store_count: "0"});
          setDeliveryDetailsLoading(false);
          return;
        }

        const bootstrap = await marketplacePricingClientService.getHomeBootstrap(
          storesWithCoordinates.map((store) => store.id),
        );
        if (!isMounted) return;
        setMarketplacePolicy(bootstrap.policy);

        const mapRoutes = (
          sourceStores: Store[],
          routes: Awaited<ReturnType<typeof getCachedStoreDeliveryRoutes>>,
        ): CustomerStore[] => {
          const routeByStoreId = new Map(
            routes.map((route) => [route.storeId, route.distanceMiles]),
          );
          return sourceStores.flatMap((store) => {
            const distance = routeByStoreId.get(store.id);
            if (distance === undefined) return [];
            const applicable = bootstrap.byStoreId[store.id];
            const storePolicy = applicable?.policy ?? bootstrap.policy;
            const isOrderZone =
              applicable?.decision?.zoneAccessType === "customer_order_zone";
            const pricing = calculateDeliveryFee(
              distance,
              0,
              storePolicy,
              storePolicy.peakSurchargeEnabled,
              !isOrderZone,
            );
            return [storeMapper.toCustomerStore(store, {
              distance,
              deliveryFee: pricing.deliveryFee,
              deliveryFeeDisplay: getDeliveryFeeDisplay(
                distance,
                storePolicy,
                !isOrderZone,
              ),
              estimatedPrepTime: getEstimatedTimeNumber(
                distance,
                bootstrap.orderDeliveryPolicy,
              ),
              estimatedDeliveryTime: getEstimatedTime(
                distance,
                bootstrap.orderDeliveryPolicy,
              ),
              categories: [],
              promotions: [],
              isFavorite: false,
              maxDeliveryMiles: storePolicy.maxRadiusMiles,
              zoneAccessAllowed: applicable?.decision?.allowed ?? true,
              zoneAccessType:
                applicable?.decision?.zoneAccessType ?? "default_pricing",
            })];
          });
        };

        const routeStores = async (sourceStores: Store[]) =>
          sourceStores.length === 0
            ? []
            : getCachedStoreDeliveryRoutes(
                sourceStores.map((store) => ({
                  id: store.id,
                  latitude: store.latitude,
                  longitude: store.longitude,
                })),
                {latitude: userLocation.lat, longitude: userLocation.lng},
              );

        const preferredStores: Store[] = [];
        const exploratoryStores: Store[] = [];
        storesWithCoordinates.forEach((store) => {
          if (bootstrap.byStoreId[store.id]?.decision?.allowed === false) {
            exploratoryStores.push(store);
          } else {
            preferredStores.push(store);
          }
        });

        const preferredRoutes = await routeStores(preferredStores);
        if (!isMounted) return;
        const preferredResults = mapRoutes(preferredStores, preferredRoutes)
          .sort((first, second) => first.distance - second.distance);
        const preferredNearby = preferredResults.filter((store) =>
          store.zoneAccessAllowed &&
          (store.zoneAccessType === "customer_order_zone" ||
            store.distance <= store.maxDeliveryMiles)
        );
        const preferredFar = preferredResults.filter((store) =>
          !preferredNearby.some((nearbyStore) => nearbyStore.id === store.id)
        );

        if (preferredStores.length > 0 && preferredResults.length !== preferredStores.length) {
          setDistanceError(
            "Some stores could not be shown because their delivery distance could not be calculated."
          );
        }
        setNearbyStores(preferredNearby);
        setFarStores(preferredFar);
        hasLoadedStoresRef.current = true;
        setDeliveryDetailsLoading(false);
        if (preferredResults.length > 0 || exploratoryStores.length === 0) {
          setLoading(false);
          homeTrace.stop({
            stage: "preferred",
            store_count: String(preferredResults.length),
          });
        }

        // Out-of-zone stores stay discoverable, but do not delay usable stores.
        const exploratoryRoutes = await routeStores(exploratoryStores);
        if (!isMounted) return;
        const exploratoryResults = mapRoutes(exploratoryStores, exploratoryRoutes);
        const allFar = [...preferredFar, ...exploratoryResults]
          .sort((first, second) => first.distance - second.distance);
        setFarStores(allFar);
        if (exploratoryStores.length > 0 && exploratoryResults.length !== exploratoryStores.length) {
          setDistanceError(
            "Some stores could not be shown because their delivery distance could not be calculated."
          );
        }
        setLoading(false);
        setDeliveryDetailsLoading(false);
        homeTrace.stop({
          stage: "complete",
          store_count: String(preferredResults.length + exploratoryResults.length),
        });
      } catch (error) {
        console.error("Error fetching stores:", error);
        homeTrace.stop({status: "error"});
        if (isMounted) {
          setDistanceError("We could not load delivery availability. Please try again.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
          setDeliveryDetailsLoading(false);
        }
      }
    };

    if (!locationReady || !userLocation) {
      void updateStores([]);
      return () => {
        isMounted = false;
      };
    }

    if (!catalogReady) {
      return () => {
        isMounted = false;
      };
    }

    void updateStores(catalogStores);

    return () => {
      isMounted = false;
    };
  }, [catalogReady, catalogStores, locationReady, userLocation]);

  // Handle store click
  const handleStoreClick = (store: CustomerStore) => {
    const distance = store.distance;
    const maxRadius = store.maxDeliveryMiles || marketplacePolicy?.maxRadiusMiles || 0;
    
    if (
      !store.zoneAccessAllowed ||
      (store.zoneAccessType !== "customer_order_zone" && distance > maxRadius)
    ) {
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
    <main className="min-h-screen bg-white pb-28 text-[#172217]">
      {/* Top Navigation */}
      <TopNavigation
        deliveryAddress={deliveryAddress?.street}
        onDeliveryAddressClick={() => setShowAddresses(true)}
      />

      <section className="mx-auto max-w-2xl px-4 pb-3 pt-4">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-50 via-amber-50 to-white px-5 py-5 shadow-[0_12px_35px_rgba(249,115,22,0.08)]">
          <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-orange-200/35" />
          <div className="pointer-events-none absolute -bottom-12 right-16 h-24 w-24 rounded-full bg-amber-100/70" />

          <div className="relative flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-orange-700 shadow-sm">
                <Sparkles className="h-3 w-3" />
                Welcome back
              </span>
              <h1 className="mt-2 truncate text-xl font-extrabold tracking-tight text-slate-950">
                {userName}
              </h1>
              <p className="mt-1 text-sm font-medium text-slate-600">
                Your neighborhood favorites are ready.
              </p>
            </div>

            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-white shadow-[0_10px_24px_rgba(249,115,22,0.28)]">
              <ShoppingBag className="h-7 w-7" strokeWidth={2.1} />
            </div>
          </div>
        </div>
      </section>

      <MarketplaceCategoryNav
        categories={storeCategories}
        selectedCategory={selectedCategory}
        onSelect={setSelectedCategory}
      />

      <div className="sticky top-[65px] z-30 border-b border-black/[0.03] bg-white/90 px-4 py-2.5 backdrop-blur-xl">
        <div className="mx-auto max-w-2xl">
          <SearchBar
            onOpen={() => router.push("/search")}
            placeholder="What are you shopping for?"
          />
        </div>
      </div>

      {/* Promo Carousel */}
      <div className="mx-auto mt-4 max-w-2xl px-4">
        <PromoCarousel />
      </div>

      {distanceError && (
        <div className="mx-auto mt-4 max-w-[640px] rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          {distanceError}
        </div>
      )}

      {/* Store List */}
      <section className="mx-auto mt-7 max-w-2xl px-4">
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.15em] text-orange-600">Shop local</p>
            <h2 className="text-2xl font-black tracking-[-0.025em] text-[#172217]">
              {storeFilter === "favorites"
                ? "Saved stores"
                : selectedCategory
                  ? `${selectedCategory.replaceAll("_", " ")} stores`
                  : "Stores near you"}
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-500">
              {storeFilter === "favorites"
                ? `${displayedNearbyStores.length + displayedFarStores.length} saved`
                : `${deliveryDetailsLoading ? displayedProvisionalStores.length : nearbyStores.length + farStores.length} stores`}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setStoreFilter((current) =>
              current === "all" ? "favorites" : "all"
            )}
            className={
              "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-bold shadow-sm transition " +
              (storeFilter === "favorites"
                ? "border-orange-300 bg-orange-50 text-orange-700"
                : "border-black/[0.06] bg-white text-slate-700 hover:border-orange-200")
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

        {!deliveryDetailsLoading && displayedNearbyStores.length === 0 && displayedFarStores.length === 0 ? (
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
            <div className="grid gap-8">
              <AnimatePresence initial={false} mode="popLayout">
                {(deliveryDetailsLoading ? displayedProvisionalStores : displayedNearbyStores).map((store, index) => (
                <motion.div
                  key={store.id}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <StoreCard
                    store={store}
                    onClick={() => deliveryDetailsLoading
                      ? router.push(`/store/${store.id}`)
                      : handleStoreClick(store)}
                    onFavoriteChange={setFavorite}
                    priority={index === 0}
                    pricingLoading={deliveryDetailsLoading}
                  />
                </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Divider between nearby and far stores */}
            {displayedFarStores.length > 0 && (
              <div className="mt-8 mb-6">
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-gray-200" />
                  <div className="flex items-center gap-2 text-xs text-gray-400 whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                    <span>
                        More stores to explore
                      </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                  </div>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
                <p className="text-xs text-gray-400 text-center mt-1.5">
                  Browse stores outside your current zone or delivery distance
                </p>
              </div>
            )}

            {/* Far Stores Section */}
            {displayedFarStores.length > 0 && (
              <div className="mt-2 grid gap-8">
                {displayedFarStores.map((store, index) => (
                  <motion.div
                    key={store.id}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <StoreCard
                      store={store}
                      onClick={() => handleStoreClick(store)}
                      onFavoriteChange={setFavorite}
                      priority={displayedNearbyStores.length === 0 && index === 0}
                    />
                  </motion.div>
                ))}
              </div>
            )}

            {hasMoreStores && storeFilter === "all" && selectedCategory === null && (
              <button
                type="button"
                onClick={() => void loadMoreStores()}
                disabled={loadingMoreStores}
                className="mx-auto mt-8 block rounded-full border border-gray-200 bg-white px-6 py-3 text-sm font-bold text-gray-800 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
              >
                {loadingMoreStores ? "Loading…" : "Load more stores"}
              </button>
            )}

            {/* End of List Indicator */}
            {!loading && !hasMoreStores && (
              <div ref={endOfListRef} className="mt-10 text-center">
                <div className="flex items-center gap-3 justify-center">
                  <div className="flex-1 max-w-12 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400">— You&apos;ve reached the end —</span>
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
            storeId={selectedStore.id}
            storeCity={selectedStore.city}
            distance={selectedDistance}
            zoneAccessAllowed={selectedStore.zoneAccessAllowed}
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

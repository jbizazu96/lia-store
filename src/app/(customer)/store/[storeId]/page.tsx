"use client";

/*
|--------------------------------------------------------------------------
| Customer Store Page
|--------------------------------------------------------------------------
|
| Displays one store and its products to the customer.
|
| Data loading, delivery calculations, category grouping, and distance
| warning state are handled by useCustomerStore.
|
| This page is responsible only for:
| - Rendering the store UI
| - Searching and filtering products
| - Adding products to the cart
| - Navigation
|
*/

import {
  use,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
  useSearchParams,
} from "next/navigation";
import Image from "next/image";

import {
  AnimatePresence,
  motion,
} from "framer-motion";
import {
  CircleCheckBig,
  Info,
} from "lucide-react";

import { useCart } from "@/context/CartContext";
import { useCustomerStore } from "@/hooks/useCustomerStore";
import { useCustomerFavoriteStores } from "@/hooks/useCustomerFavoriteStores";
import { promotionService } from "@/services/promotion/promotionService";

import { BottomBar } from "@/components/customer/store/BottomBar";
import { CategoryScroll } from "@/components/customer/store/CategoryScroll";
import { DistanceWarningModal } from "@/components/customer/store/DistanceWarningModal";
import { ProductSection } from "@/components/customer/store/ProductSection";
import { PromoBanner } from "@/components/customer/store/PromoBanner";
import { StoreHeader } from "@/components/customer/store/StoreHeader";
import { StoreInfo } from "@/components/customer/store/StoreInfo";
import { CustomerPageState } from "@/components/customer/ui/CustomerPageState";
import type { Product } from "@/types/product";

/*
|--------------------------------------------------------------------------
| Page Props
|--------------------------------------------------------------------------
*/

interface StorePageProps {
  params: Promise<{
    storeId: string;
  }>;
}

/*
|--------------------------------------------------------------------------
| Page Component
|--------------------------------------------------------------------------
*/

export default function StorePage({
  params,
}: StorePageProps) {
  const { storeId } = use(params);

  const router = useRouter();
  const searchParams = useSearchParams();

  /*
  |--------------------------------------------------------------------------
  | Cart
  |--------------------------------------------------------------------------
  */

  const {
    addItem,
    updateQuantity,
    getItemQuantity,
    getStoreItemCount,
    getStoreTotalPrice,
  } = useCart();

  /*
  |--------------------------------------------------------------------------
  | URL Delivery Values
  |--------------------------------------------------------------------------
  |
  | The home page may pass delivery information through the URL.
  | The hook recalculates missing values when necessary.
  |
  */

  const distanceParam =
    searchParams.get("distance");

  const deliveryFeeParam =
    searchParams.get("deliveryFee");

  const estimatedTimeParam =
    searchParams.get("estimatedTime");

  const skipDistanceWarning =
    searchParams.get("skipDistanceWarning") === "1";

  /*
  |--------------------------------------------------------------------------
  | Store Data Hook
  |--------------------------------------------------------------------------
  */

  const {
    store,
    categories,
    loading,
    resolvedStoreId,
    error,
    showDistanceWarning,
    distanceValue,
    closeDistanceWarning,
    openDistanceWarning,
    isOutsideDeliveryRadius,
  } = useCustomerStore({
    storeId,
    distanceParam,
    deliveryFeeParam,
    estimatedTimeParam,
    skipDistanceWarning,
  });

  const {
    isFavorite,
    setFavorite,
  } = useCustomerFavoriteStores();
  const [favoriteSaving, setFavoriteSaving] = useState(false);

  /*
  |--------------------------------------------------------------------------
  | Cart Summary
  |--------------------------------------------------------------------------
  */

  const storeItemCount =
    getStoreItemCount(storeId);

  const storeTotalPrice =
    getStoreTotalPrice(storeId);

  const sortedCategories = useMemo(
    () => [...categories].sort((first, second) =>
      first.name.localeCompare(second.name, undefined, {sensitivity: "base"})
    ),
    [categories]
  );

  const hasFreshCategories =
    sortedCategories.some((category) =>
      [
        "produce",
        "meat",
        "seafood",
        "dairy",
        "bakery",
        "frozen",
      ].includes(
        category.id.toLowerCase()
      )
    );

  /*
  |--------------------------------------------------------------------------
  | Add Product To Cart
  |--------------------------------------------------------------------------
  */

  const handleAddToCart = (
    product: Product
  ) => {
    if (!store) {
      return;
    }

    if (isOutsideDeliveryRadius) {
      openDistanceWarning();
      return;
    }

    const currentQuantity =
      getItemQuantity(product.id);

    /*
     * If the item already exists, increase its quantity.
     */

    if (currentQuantity > 0) {
      updateQuantity(
        product.id,
        currentQuantity + 1
      );

      return;
    }

    /*
     * Otherwise, create a new cart item.
     */

    const discountedPrice =
      promotionService.getDiscountedPrice(
        product.price,
        product.promotion
      );

    void addItem({
      id: product.id,
      name: product.name,
      price: discountedPrice,
      originalPrice:
        discountedPrice < product.price
          ? product.price
          : undefined,
      imageUrl: product.imageUrl,

      storeId: store.id,
      storeName: store.name,
      storeAddress: store.address,
      storePhone: store.phone,
      storeLatitude: store.latitude,
      storeLongitude: store.longitude,

      stock: product.stock,

      size: product.size ?? undefined,
    });
  };

  /*
  |--------------------------------------------------------------------------
  | Quantity Handler
  |--------------------------------------------------------------------------
  */

  const handleQuantityChange = (
    productId: string,
    newQuantity: number
  ) => {
    if (
      isOutsideDeliveryRadius &&
      newQuantity >
      getItemQuantity(productId)
    ) {
      openDistanceWarning();
      return;
    }

    updateQuantity(
      productId,
      Math.max(0, newQuantity)
    );
  };

  /*
  |--------------------------------------------------------------------------
  | Distance Warning Handlers
  |--------------------------------------------------------------------------
  */

  const handleContinueToStore = () => {
    closeDistanceWarning();
  };

  const handleGoBack = () => {
    closeDistanceWarning();
    router.push("/home");
  };

  const handleFavoriteChange = () => {
    if (!store) {
      return;
    }

    setFavoriteSaving(true);
    void setFavorite(store.id, !isFavorite(store.id))
      .catch((favoriteError) => {
        console.error("Unable to update saved store:", favoriteError);
      })
      .finally(() => {
        setFavoriteSaving(false);
      });
  };

  /*
  |--------------------------------------------------------------------------
  | Loading State
  |--------------------------------------------------------------------------
  */

  if (loading || resolvedStoreId !== storeId) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-white">
        <div className="pointer-events-none absolute right-0 top-0 h-[500px] w-[500px] rounded-full bg-yellow-400/5 blur-[120px]" />

        <div className="pointer-events-none absolute bottom-0 left-0 h-[400px] w-[400px] rounded-full bg-blue-500/5 blur-[100px]" />

        <motion.div
          initial={{
            opacity: 0,
            scale: 0.9,
          }}
          animate={{
            opacity: 1,
            scale: 1,
          }}
          transition={{
            duration: 0.5,
          }}
          className="relative z-10 flex flex-col items-center justify-center p-8"
        >
          <div className="relative mb-8 flex h-28 w-28 items-center justify-center">
            <motion.div
              animate={{
                rotate: 360,
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: "linear",
              }}
              className="absolute inset-0 rounded-full border-2 border-dashed border-yellow-400/30"
            />

            <motion.div
              animate={{
                rotate: -360,
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "linear",
              }}
              className="absolute inset-2 rounded-full border border-yellow-400/10"
            />

            <motion.div
              animate={{
                rotate: 360,
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: "linear",
              }}
              className="absolute inset-0"
            >
              <div className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.8)]" />

              <div className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-yellow-400/40" />

              <div className="absolute left-0 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-400/40" />

              <div className="absolute right-0 top-1/2 h-2 w-2 translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-400/40" />
            </motion.div>

            <div className="relative z-10 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-yellow-400/50 bg-white/80 shadow-[0_0_30px_rgba(234,179,8,0.15)] backdrop-blur-md">
              <Image
                src="/icon/icon-192.png"
                alt="LIA Store"
                width={48}
                height={48}
                className="h-12 w-12 object-contain"
              />
            </div>
          </div>

          <motion.div
            initial={{
              opacity: 0,
              y: 10,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            transition={{
              duration: 0.4,
              delay: 0.2,
            }}
            className="text-center"
          >
            <h3 className="mb-1 text-lg font-medium tracking-wide text-gray-600">
              Loading store
            </h3>

            <div className="mt-2 flex items-center justify-center gap-1">
              {[0, 0.3, 0.6].map(
                (delay) => (
                  <motion.span
                    key={delay}
                    animate={{
                      opacity: [
                        0.5,
                        1,
                        0.5,
                      ],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      delay,
                    }}
                    className="h-1.5 w-1.5 rounded-full bg-yellow-400"
                  />
                )
              )}
            </div>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Error State
  |--------------------------------------------------------------------------
  */

  if (error || !store) {
    return (
      <main className="min-h-screen bg-white">
        <CustomerPageState
          kind="error"
          title="This store is unavailable"
          description={error ?? "The store may no longer be available in your area."}
          action={{
            label: "Browse stores",
            href: "/home",
          }}
        />
      </main>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Store Page
  |--------------------------------------------------------------------------
  */

  return (
    <main className="min-h-screen bg-white pb-28 text-[#172217]">
      <StoreHeader
        bannerUrl={store.bannerUrl}
        bannerImageVariants={store.bannerImageVariants}
        name={store.name}
        isFavorite={isFavorite(store.id)}
        onBack={() =>
          router.push("/home")
        }
        onFavoriteChange={handleFavoriteChange}
        favoriteSaving={favoriteSaving}
      />

      <StoreInfo
          name={store.name}
          address={store.address}
          logoUrl={store.logoUrl}
          logoImageVariants={store.logoImageVariants}
          isOpen={store.isOpen}
          distance={store.distance}
          deliveryFee={store.deliveryFee}
          estimatedPrepTime={
            store.estimatedPrepTime
          }
          rating={store.rating ?? 0}
          reviewCount={store.reviewCount}
          schedule={store.schedule}
          onViewMore={() =>
            router.push(
              `/store/${store.id}/info`
            )
          }
        />

      {store.promotions.length > 0 && (
        <div className="mx-auto mt-5 max-w-2xl px-4">
          <PromoBanner
            promotions={
              store.promotions
            }
          />
        </div>
      )}

      {sortedCategories.length > 0 && (
        <div className="mx-auto mt-5 max-w-2xl px-4">
          {hasFreshCategories && (
            <div className="mb-5 flex items-center gap-2.5 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3.5 text-sm font-semibold text-emerald-900">
              <CircleCheckBig className="h-5 w-5 shrink-0 text-emerald-600" />
              <span className="flex-1">
                Freshness guaranteed or your money back
              </span>
              <Info
                className="h-5 w-5 shrink-0 text-emerald-700/70"
                aria-hidden="true"
              />
            </div>
          )}

          <div className="mb-3">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-orange-600">
              Shop by category
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-[-0.025em] text-[#172217]">
              Browse the aisles
            </h2>
          </div>

          <CategoryScroll
            categories={sortedCategories}
            onCategoryClick={(categoryId) =>
              router.push(
                "/store/" +
                  store.id +
                  "/category/" +
                  encodeURIComponent(categoryId)
              )
            }
            onDealsClick={() =>
              router.push(
                "/store/" +
                  store.id +
                  "/category/deals"
              )
            }
          />
        </div>
      )}

      {sortedCategories.map((category, categoryIndex) => (
          <ProductSection
            key={category.id}
            category={category}
            products={category.products}
            onAddToCart={
              handleAddToCart
            }
            onQuantityChange={
              handleQuantityChange
            }
            getQuantity={
              getItemQuantity
            }
            onViewAll={() =>
              router.push(
                "/store/" +
                  store.id +
                  "/category/" +
                  encodeURIComponent(category.id)
              )
            }
            preloadFirstImage={categoryIndex === 0}
          />
        ))}

      <BottomBar
        searchQuery=""
        onSearchChange={() => undefined}
        onSearchClick={() =>
          router.push(
            "/store/" + store.id + "/search"
          )
        }
        itemCount={storeItemCount}
        totalPrice={storeTotalPrice}
        onCartClick={() =>
          router.push("/cart")
        }
      />

      <AnimatePresence>
        {showDistanceWarning && (
          <DistanceWarningModal
            store={store}
            distance={distanceValue}
            onClose={handleGoBack}
            onContinue={
              handleContinueToStore
            }
          />
        )}
      </AnimatePresence>
    </main>
  );
}

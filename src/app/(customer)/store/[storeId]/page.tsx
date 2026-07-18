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
  useEffect,
  useState,
} from "react";

import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  AnimatePresence,
  motion,
} from "framer-motion";

import { useCart } from "@/context/CartContext";
import { useCustomerStore } from "@/hooks/useCustomerStore";

import { BottomBar } from "@/components/customer/store/BottomBar";
import { CategoryScroll } from "@/components/customer/store/CategoryScroll";
import { DistanceWarningModal } from "@/components/customer/store/DistanceWarningModal";
import { ProductCard } from "@/components/customer/store/ProductCard";
import { ProductSection } from "@/components/customer/store/ProductSection";
import { PromoBanner } from "@/components/customer/store/PromoBanner";
import { StoreHeader } from "@/components/customer/store/StoreHeader";
import { StoreInfo } from "@/components/customer/store/StoreInfo";

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

  /*
  |--------------------------------------------------------------------------
  | Store Data Hook
  |--------------------------------------------------------------------------
  */

  const {
    store,
    categories,
    products: allProducts,
    loading,
    error,
    showDistanceWarning,
    distanceValue,
    closeDistanceWarning,
  } = useCustomerStore({
    storeId,
    distanceParam,
    deliveryFeeParam,
    estimatedTimeParam,
  });

  /*
  |--------------------------------------------------------------------------
  | Local UI State
  |--------------------------------------------------------------------------
  */

  const [
    displayProducts,
    setDisplayProducts,
  ] = useState<Product[]>([]);

  const [
    searchQuery,
    setSearchQuery,
  ] = useState("");

  const [
    selectedCategory,
    setSelectedCategory,
  ] = useState("all");

  /*
  |--------------------------------------------------------------------------
  | Cart Summary
  |--------------------------------------------------------------------------
  */

  const storeItemCount =
    getStoreItemCount(storeId);

  const storeTotalPrice =
    getStoreTotalPrice(storeId);

  /*
  |--------------------------------------------------------------------------
  | Product Filtering
  |--------------------------------------------------------------------------
  |
  | Search takes priority over category filtering.
  |
  */

  useEffect(() => {
    const normalizedSearch =
      searchQuery.trim().toLowerCase();

    /*
    |--------------------------------------------------------------------------
    | Search Products
    |--------------------------------------------------------------------------
    */

    if (normalizedSearch) {
      const filteredProducts =
        allProducts.filter((product) => {
          const productName =
            product.name.toLowerCase();

          const productDescription =
            product.description.toLowerCase();

          const productCategory =
            product.category.toLowerCase();

          return (
            productName.includes(
              normalizedSearch
            ) ||
            productDescription.includes(
              normalizedSearch
            ) ||
            productCategory.includes(
              normalizedSearch
            )
          );
        });

      setDisplayProducts(
        filteredProducts
      );

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | Show All Products
    |--------------------------------------------------------------------------
    */

    if (selectedCategory === "all") {
      setDisplayProducts(allProducts);
      return;
    }

    /*
    |--------------------------------------------------------------------------
    | Show Selected Category
    |--------------------------------------------------------------------------
    */

    const selectedCategoryData =
      categories.find(
        (category) =>
          category.id ===
          selectedCategory
      );

    setDisplayProducts(
      selectedCategoryData?.products ??
        []
    );
  }, [
    allProducts,
    categories,
    searchQuery,
    selectedCategory,
  ]);

  /*
  |--------------------------------------------------------------------------
  | Search Handler
  |--------------------------------------------------------------------------
  */

  const handleSearch = (
    query: string
  ) => {
    setSearchQuery(query);
  };

  /*
  |--------------------------------------------------------------------------
  | Category Handler
  |--------------------------------------------------------------------------
  */

  const handleCategorySelect = (
    categoryId: string
  ) => {
    setSelectedCategory(categoryId);

    /*
     * Clear search when the customer selects a category.
     */

    if (searchQuery) {
      setSearchQuery("");
    }
  };

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

    void addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl,

      storeId: store.id,
      storeName: store.name,
      storeAddress: store.address,
      storePhone: store.phone,
      storeLatitude: store.latitude,
      storeLongitude: store.longitude,

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

  /*
  |--------------------------------------------------------------------------
  | Loading State
  |--------------------------------------------------------------------------
  */

  if (loading) {
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
              <img
                src="/icon/icon-192.png"
                alt="LIA Store"
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
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-gray-500">
          {error ?? "Store not found"}
        </p>

        <button
          type="button"
          onClick={() =>
            router.push("/home")
          }
          className="rounded-xl bg-orange-500 px-5 py-2.5 font-semibold text-white transition hover:bg-orange-600"
        >
          Return Home
        </button>
      </main>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Store Page
  |--------------------------------------------------------------------------
  */

  return (
    <main className="min-h-screen bg-gray-50 pb-20">
      <StoreHeader
        bannerUrl={store.bannerUrl}
        logoUrl={store.logoUrl}
        name={store.name}
        rating={store.rating ?? 0}
        reviewCount={store.reviewCount}
        onBack={() =>
          router.push("/home")
        }
      />

      <StoreInfo
        name={store.name}
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
        <div className="mt-4 px-4">
          <PromoBanner
            promotions={
              store.promotions
            }
          />
        </div>
      )}

      {categories.length > 0 && (
        <div className="mt-4 px-4">
          <CategoryScroll
            categories={categories}
            selectedCategory={
              selectedCategory
            }
            onSelect={
              handleCategorySelect
            }
          />
        </div>
      )}

      {searchQuery.trim() ? (
        <div className="mt-4 px-4 pb-24">
          <h3 className="mb-3 font-bold text-gray-800">
            Search Results (
            {displayProducts.length})
          </h3>

          {displayProducts.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-gray-500">
                No products found
              </p>

              <p className="text-sm text-gray-400">
                Try adjusting your search
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {displayProducts.map(
                (product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onAddToCart={
                      handleAddToCart
                    }
                    onQuantityChange={
                      handleQuantityChange
                    }
                    quantity={getItemQuantity(
                      product.id
                    )}
                  />
                )
              )}
            </div>
          )}
        </div>
      ) : selectedCategory !== "all" ? (
        <div className="mt-4 px-4 pb-24">
          <h3 className="mb-3 font-bold text-gray-800">
            {
              categories.find(
                (category) =>
                  category.id ===
                  selectedCategory
              )?.name
            }
          </h3>

          {displayProducts.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-gray-500">
                No products in this category
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {displayProducts.map(
                (product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onAddToCart={
                      handleAddToCart
                    }
                    onQuantityChange={
                      handleQuantityChange
                    }
                    quantity={getItemQuantity(
                      product.id
                    )}
                  />
                )
              )}
            </div>
          )}
        </div>
      ) : (
        categories.map((category) => (
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
            onViewAll={() => {
              setSelectedCategory(
                category.id
              );

              setSearchQuery("");
            }}
          />
        ))
      )}

      <BottomBar
        searchQuery={searchQuery}
        onSearchChange={handleSearch}
        itemCount={storeItemCount}
        totalPrice={storeTotalPrice}
        storeId={store.id}
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

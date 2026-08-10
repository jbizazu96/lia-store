"use client";

/*
|--------------------------------------------------------------------------
| Store Product Search Page
|--------------------------------------------------------------------------
|
| Searches only the products already available in the current store. The
| product grid intentionally uses the category-page card layout so customers
| can compare products two at a time without leaving this store context.
|
*/

import {
  use,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useRouter,
} from "next/navigation";
import {
  ArrowLeft,
  Search,
  X,
} from "lucide-react";
import {
  AnimatePresence,
} from "framer-motion";

import {
  useCart,
} from "@/context/CartContext";
import {
  useCustomerStore,
} from "@/hooks/useCustomerStore";
import {
  promotionService,
} from "@/services/promotion/promotionService";
import {
  BottomBar,
} from "@/components/customer/store/BottomBar";
import {
  DistanceWarningModal,
} from "@/components/customer/store/DistanceWarningModal";
import {
  ProductCard,
} from "@/components/customer/store/ProductCard";
import { CustomerPageState } from "@/components/customer/ui/CustomerPageState";
import { CustomerPageSkeleton } from "@/components/customer/ui/CustomerPageSkeleton";
import type {
  Product,
} from "@/types/product";

interface StoreSearchPageProps {
  params: Promise<{
    storeId: string;
  }>;
}

function normalizeSearchText(
  value: string
): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function StoreSearchPage({
  params,
}: StoreSearchPageProps) {
  const {
    storeId,
  } = use(params);
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    store,
    products,
    loading,
    resolvedStoreId,
    error,
    showDistanceWarning,
    distanceValue,
    isOutsideDeliveryRadius,
    closeDistanceWarning,
    openDistanceWarning,
  } = useCustomerStore({
    storeId,
    skipDistanceWarning: true,
  });

  useLayoutEffect(() => {
    /* See the global search header: App Router transitions can drop the
     * browser's native focus handoff on mobile. This page first renders its
     * store loader, so wait until the actual search input is mounted. */
    if (loading || resolvedStoreId !== storeId) {
      return;
    }

    const focusInput = () => {
      const input = searchInputRef.current;
      if (!input) {
        return;
      }

      input.focus({
        preventScroll: true,
      });
      input.setSelectionRange(input.value.length, input.value.length);
    };
    const frame = window.requestAnimationFrame(focusInput);
    const firstRetry = window.setTimeout(focusInput, 160);
    const secondRetry = window.setTimeout(focusInput, 360);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(firstRetry);
      window.clearTimeout(secondRetry);
    };
  }, [loading, resolvedStoreId, storeId]);

  const {
    addItem,
    updateQuantity,
    getItemQuantity,
    getStoreItemCount,
    getStoreTotalPrice,
  } = useCart();

  const normalizedQuery = normalizeSearchText(searchQuery);

  const displayedProducts = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    return products.filter((product) =>
      [
        product.name,
        product.description ?? "",
        product.category,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery)
    );
  }, [
    normalizedQuery,
    products,
  ]);

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

    const currentQuantity = getItemQuantity(product.id);

    if (currentQuantity > 0) {
      updateQuantity(product.id, currentQuantity + 1);
      return;
    }

    const discountedPrice = promotionService.getDiscountedPrice(
      product.price,
      product.promotion
    );

    void addItem({
      id: product.id,
      name: product.name,
      price: discountedPrice,
      originalPrice: discountedPrice < product.price
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

  const handleQuantityChange = (
    productId: string,
    quantity: number
  ) => {
    if (
      isOutsideDeliveryRadius &&
      quantity > getItemQuantity(productId)
    ) {
      openDistanceWarning();
      return;
    }

    updateQuantity(productId, Math.max(0, quantity));
  };

  if (loading || resolvedStoreId !== storeId) {
    return (
      <main className="min-h-screen bg-white px-4 pt-5 sm:px-6">
        <header className="sticky top-0 z-30 -mx-4 bg-white/95 px-4 pb-5 pt-[env(safe-area-inset-top)] backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push(`/store/${storeId}`)}
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-white text-gray-900 shadow-sm ring-1 ring-black/5 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
              aria-label="Go back"
            >
              <ArrowLeft className="h-6 w-6" strokeWidth={2.5} />
            </button>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
              <input
                ref={searchInputRef}
                autoFocus
                type="search"
                inputMode="search"
                enterKeyHint="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search store products"
                className="h-12 w-full rounded-full border border-gray-200 bg-white py-3 pl-12 pr-11 text-base font-medium text-gray-950 shadow-sm outline-none placeholder:font-normal placeholder:text-gray-500 focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
              />
            </div>
          </div>
        </header>
        <CustomerPageSkeleton variant="search" />
      </main>
    );
  }

  if (error || !store) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-gray-500">
          {error ?? "This store could not be loaded"}
        </p>
        <button
          type="button"
          onClick={() => router.push("/store/" + storeId)}
          className="rounded-xl bg-orange-500 px-5 py-2.5 font-semibold text-white transition hover:bg-orange-600"
        >
          Return to store
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-4 pb-28 pt-5 sm:px-6">
      <header className="sticky top-0 z-30 -mx-4 bg-white/95 px-4 pb-5 pt-[env(safe-area-inset-top)] backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/store/${storeId}`)}
            className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-white text-gray-900 shadow-sm ring-1 ring-black/5 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
            aria-label={"Back to " + store.name}
          >
            <ArrowLeft className="h-6 w-6" strokeWidth={2.5} />
          </button>

          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
            <input
              ref={searchInputRef}
              autoFocus
              type="search"
              inputMode="search"
              enterKeyHint="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={"Search " + store.name}
              className="h-12 w-full rounded-full border border-gray-200 bg-white py-3 pl-12 pr-11 text-base font-medium text-gray-950 shadow-sm outline-none placeholder:font-normal placeholder:text-gray-500 focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition hover:bg-gray-200"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </header>

      <section className="pt-5">
        {normalizedQuery ? (
          <>
            <div className="mb-5 flex items-baseline justify-between gap-3">
              <h1 className="text-2xl font-extrabold tracking-tight text-gray-950">
                Search results
              </h1>
              <p className="text-sm font-medium text-gray-500">
                {displayedProducts.length} found
              </p>
            </div>

            {displayedProducts.length > 0 ? (
              <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-5 sm:gap-y-8">
                {displayedProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    layout="grid"
                    onAddToCart={handleAddToCart}
                    onQuantityChange={handleQuantityChange}
                    quantity={getItemQuantity(product.id)}
                  />
                ))}
              </div>
            ) : (
              <SearchEmptyState query={searchQuery} />
            )}
          </>
        ) : (
          <section className="flex min-h-[55vh] flex-col items-center justify-center px-6 text-center">
            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-orange-50">
              <Search className="h-10 w-10 text-orange-400" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">
              Search this store
            </h1>
            <p className="mt-2 max-w-xs text-sm leading-6 text-gray-500">
              Find products available at {store.name}.
            </p>
          </section>
        )}
      </section>

      <BottomBar
        searchQuery=""
        onSearchChange={() => undefined}
        showSearch={false}
        itemCount={getStoreItemCount(storeId)}
        totalPrice={getStoreTotalPrice(storeId)}
        onCartClick={() => router.push("/cart")}
      />

      <AnimatePresence>
        {showDistanceWarning && (
          <DistanceWarningModal
            store={store}
            distance={distanceValue}
            onClose={() => {
              closeDistanceWarning();
              router.push("/home");
            }}
            onContinue={closeDistanceWarning}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

function SearchEmptyState({
  query,
}: {
  query: string;
}) {
  return (
    <CustomerPageState
      kind="search-empty"
      title="No products found"
      description={`Nothing in this store matches “${query.trim()}”. Try a different product name.`}
      compact
    />
  );
}

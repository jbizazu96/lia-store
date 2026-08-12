"use client";

/*
|--------------------------------------------------------------------------
| Store Category Page
|--------------------------------------------------------------------------
|
| A dedicated, two-column view for every product in one store category.
| The store page remains focused on browsing multiple category sections.
|
*/

import {
  use,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CircleCheckBig,
  PackageOpen,
} from "lucide-react";
import { AnimatePresence } from "framer-motion";

import { useCart } from "@/context/CartContext";
import { useCustomerStore } from "@/hooks/useCustomerStore";
import { promotionService } from "@/services/promotion/promotionService";
import { productService } from "@/services/product/productService";
import { DistanceWarningModal } from "@/components/customer/store/DistanceWarningModal";
import { BottomBar } from "@/components/customer/store/BottomBar";
import { ProductCard } from "@/components/customer/store/ProductCard";
import { CustomerPageSkeleton } from "@/components/customer/ui/CustomerPageSkeleton";
import type { Product } from "@/types/product";

interface StoreCategoryPageProps {
  params: Promise<{
    storeId: string;
    categoryId: string;
  }>;
}

export default function StoreCategoryPage({
  params,
}: StoreCategoryPageProps) {
  const { storeId, categoryId } = use(params);
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryProducts, setCategoryProducts] = useState<Product[]>([]);
  const [productCursor, setProductCursor] = useState<{name: string; id: string} | null>(null);
  const [hasMoreProducts, setHasMoreProducts] = useState(false);
  const [loadingMoreProducts, setLoadingMoreProducts] = useState(false);

  const {
    store,
    categories,
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

    /*
     * Category browsing should remain uninterrupted. The same hook still
     * opens this warning when the customer attempts to add or increase an
     * item outside the delivery radius.
     */
    skipDistanceWarning: true,
  });

  const {
    addItem,
    updateQuantity,
    getItemQuantity,
    getStoreItemCount,
    getStoreTotalPrice,
  } = useCart();

  const category = categories.find(
    (item) => item.id === categoryId
  );

  const isDealsPage =
    categoryId === "deals";

  useEffect(() => {
    if (loading || resolvedStoreId !== storeId) return;
    let active = true;

    void productService.getStoreProductsPage(storeId, {
      pageSize: 40,
      categoryValues: isDealsPage
        ? undefined
        : Array.from(new Set([categoryId, category?.name].filter((value): value is string => Boolean(value)))),
    }).then((page) => {
      if (!active) return;
      setCategoryProducts(page.products);
      setProductCursor(page.nextCursor);
      setHasMoreProducts(page.hasMore);
    }).catch((loadError) => {
      console.error("Unable to load category products:", loadError);
    });

    return () => { active = false; };
  }, [category?.name, categoryId, isDealsPage, loading, resolvedStoreId, storeId]);

  const pageProducts =
    isDealsPage
      ? categoryProducts.filter(
          (product) =>
            product.promotion !== undefined &&
            promotionService.isActive(
              product.promotion
            )
        )
      : categoryProducts;

  const loadMoreProducts = async () => {
    if (!productCursor || !hasMoreProducts || loadingMoreProducts) return;
    try {
      setLoadingMoreProducts(true);
      const page = await productService.getStoreProductsPage(storeId, {
        cursor: productCursor,
        pageSize: 40,
        categoryValues: isDealsPage
          ? undefined
          : Array.from(new Set([categoryId, category?.name].filter((value): value is string => Boolean(value)))),
      });
      setCategoryProducts((current) => [...current, ...page.products]);
      setProductCursor(page.nextCursor);
      setHasMoreProducts(page.hasMore);
    } finally {
      setLoadingMoreProducts(false);
    }
  };

  const hasFreshProducts =
    category?.freshnessEligible === true && pageProducts.length > 0;

  const normalizedSearch =
    searchQuery.trim().toLowerCase();

  const displayedProducts =
    normalizedSearch
      ? pageProducts.filter((product) =>
          [
            product.name,
            product.description ?? "",
            product.category,
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch)
        )
      : pageProducts;

  const storeItemCount =
    getStoreItemCount(storeId);

  const storeTotalPrice =
    getStoreTotalPrice(storeId);

  const handleAddToCart = (product: Product) => {
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
    return <CustomerPageSkeleton variant="store" />;
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
      <button
        type="button"
        onClick={() => router.push(`/store/${storeId}`)}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-900 shadow-md ring-1 ring-black/5 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-500"
        aria-label={"Back to " + store.name}
      >
        <ArrowLeft className="h-6 w-6" strokeWidth={2.5} />
      </button>

      <header className="mb-6 mt-12">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-950 sm:text-4xl">
          {isDealsPage
            ? "Deals"
            : category?.name ?? "Category"}
        </h1>
      </header>

      {hasFreshProducts && (
        <div className="mb-5 flex items-center gap-2.5 rounded-2xl bg-emerald-50 px-3.5 py-3 text-sm font-semibold text-emerald-900">
          <CircleCheckBig className="h-5 w-5 shrink-0 text-emerald-600" />
          <span>
            Freshness guaranteed or your money back
          </span>
        </div>
      )}

      {displayedProducts.length === 0 ? (
        <section className="flex min-h-[55vh] flex-col items-center justify-center px-6 text-center">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-orange-50">
            <PackageOpen className="h-10 w-10 text-orange-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">
            Nothing here yet
          </h2>
          <p className="mt-2 max-w-xs text-sm leading-6 text-gray-500">
            {isDealsPage
              ? "There are no active deals at this store right now."
              : normalizedSearch
                ? "No products match your search in this category."
                : "This category does not have any products available right now."}
          </p>
          <button
            type="button"
            onClick={() => router.push("/store/" + storeId)}
            className="mt-6 rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600"
          >
            Browse store
          </button>
        </section>
      ) : (
        <>
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
          {hasMoreProducts && !normalizedSearch && (
            <button
              type="button"
              onClick={() => void loadMoreProducts()}
              disabled={loadingMoreProducts}
              className="mx-auto mt-8 block rounded-full border border-gray-200 bg-white px-6 py-3 text-sm font-bold text-gray-800 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
            >
              {loadingMoreProducts ? "Loading…" : "Load more products"}
            </button>
          )}
        </>
      )}

      <BottomBar
        searchQuery=""
        onSearchChange={setSearchQuery}
        onSearchClick={() => router.push(`/store/${storeId}/search`)}
        itemCount={storeItemCount}
        totalPrice={storeTotalPrice}
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

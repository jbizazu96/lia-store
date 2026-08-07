"use client";

/*
|--------------------------------------------------------------------------
| Global Search Store Section
|--------------------------------------------------------------------------
|
| Each store is rendered like a category section on the customer store page.
| The shared ProductCard preserves the same product image, stock, promotion,
| and cart-control experience everywhere customers browse products.
|
*/

import {
  ArrowRight,
  Clock3,
  MapPin,
  Star,
} from "lucide-react";
import type {
  Product,
} from "@/types/product";
import {
  useCart,
} from "@/context/CartContext";
import {
  promotionService,
} from "@/services/promotion/promotionService";
import {
  ProductCard,
} from "@/components/customer/store/ProductCard";
import type {
  SearchResult,
  StoreGroup,
} from "../types";

interface StoreResultProps {
  group: StoreGroup;
  onStoreClick: (storeId: string) => void;
}

function formatDistance(
  distance: number
): string {
  if (distance <= 0) {
    return "Distance unavailable";
  }

  return distance < 1
    ? `${(distance * 1000).toFixed(0)} m`
    : `${distance.toFixed(1)} mi`;
}

function formatTime(
  minutes: number
): string {
  if (minutes <= 0) {
    return "Time unavailable";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`;
}

function searchResultProduct(
  result: SearchResult
): Product {
  return {
    id: result.id,
    storeId: result.storeId,
    name: result.name,
    description: result.description,
    category: result.category,
    price: result.price,
    stock: result.stock,
    imageUrl: result.imageUrl,
    imageVariants: result.imageVariants,
    sku: "",
    isAvailable: true,
    featured: false,
    size: result.size ?? null,
    promotion: result.promotion as Product["promotion"],
    createdAt: "",
    updatedAt: "",
  };
}

export function StoreResult({
  group,
  onStoreClick,
}: StoreResultProps) {
  const {
    addItem,
    getItemQuantity,
    updateQuantity,
  } = useCart();

  const addProductToCart = (
    product: Product
  ) => {
    if (!group.isOpen) {
      onStoreClick(group.storeId);
      return;
    }

    const discountedPrice = promotionService
      .getDiscountedPrice(
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
      storeId: group.storeId,
      storeName: group.storeName,
      storeAddress: group.storeAddress,
      storePhone: group.storePhone,
      storeLatitude: group.storeLatitude,
      storeLongitude: group.storeLongitude,
      stock: product.stock,
      size: product.size ?? undefined,
    });
  };

  return (
    <section className="border-b border-gray-200 pb-6 last:border-b-0">
      <div className="mb-3 flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onStoreClick(group.storeId)}
          className="min-w-0 text-left focus:outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="truncate text-xl font-bold text-gray-900">
              {group.storeName}
            </h2>
            {group.matchesStore && (
              <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700">
                Store match
              </span>
            )}
            {!group.isOpen && (
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-700">
                Currently closed
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600">
            <span className="inline-flex items-center gap-1 font-semibold text-gray-800">
              <Star className="h-3.5 w-3.5 fill-orange-400 text-orange-400" />
              {group.storeRating.toFixed(1)}
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {formatDistance(group.storeDistance)}
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" />
              {formatTime(group.estimatedTime)}
            </span>
          </div>

          <p className="mt-1 text-sm text-gray-500">
            {group.deliveryFee === 0
              ? "Free delivery"
              : `Delivery $${group.deliveryFee.toFixed(2)}`}
            {group.products.length > 0
              ? ` · ${group.products.length} matching ${group.products.length === 1 ? "product" : "products"}`
              : ""}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onStoreClick(group.storeId)}
          className="mt-0.5 flex h-10 w-10 flex-none items-center justify-center rounded-full bg-gray-100 text-gray-900 transition hover:bg-orange-500 hover:text-white"
          aria-label={`View ${group.storeName}`}
        >
          <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
        </button>
      </div>

      {!group.isOpen && group.products.length > 0 && (
        <p className="rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-600">
          This store is currently closed. Open the store to view its schedule.
        </p>
      )}

      {group.isOpen && group.products.length > 0 && (
        <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide px-0.5 snap-x snap-mandatory">
          {group.products.map((result) => {
            const product = searchResultProduct(result);

            return (
              <div
                key={product.id}
                className="flex-shrink-0 snap-start"
              >
                <ProductCard
                  product={product}
                  onAddToCart={addProductToCart}
                  onQuantityChange={updateQuantity}
                  quantity={getItemQuantity(product.id)}
                />
              </div>
            );
          })}
        </div>
      )}

      {group.isOpen && group.products.length === 0 && (
        <p className="text-sm text-gray-500">
          This store matches your search. Open it to browse its catalog.
        </p>
      )}
    </section>
  );
}

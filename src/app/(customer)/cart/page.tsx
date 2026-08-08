"use client";

/*
  Modern cart page with proper spacing.
  All items visible, summary at bottom without overlapping.
  ✅ Shows loading state while cart is being loaded from Firestore.
*/

import {
  useCartPricing,
} from "@/hooks/useCartPricing";
import {
  useCartStoreStatus,
} from "@/hooks/useCartStoreStatus";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { CustomerPageSkeleton } from "@/components/customer/ui/CustomerPageSkeleton";
import {
  ShoppingCart,
  Plus,
  Minus,
  ArrowLeft,
  ShoppingBag,
  Truck,
  Clock,
  CreditCard,
  Trash2,
  AlertCircle,
  Info,
} from "lucide-react";
import { useCart } from "@/context/CartContext";
import {
  ProductPrice,
} from "@/components/ui/ProductPrice";
import {
  formatProductName,
} from "@/utils/productDisplay";
import {
  FeeInfoSheet,
  type FeeInfoType,
} from "@/components/customer/cart/FeeInfoSheet";
import {useMarketplacePricingPolicy} from "@/hooks/useMarketplacePricingPolicy";

export default function CartPage() {
  const marketplacePolicy = useMarketplacePricingPolicy();
  const router = useRouter();
  const { items, itemCount, totalPrice, updateQuantity, removeItem, clearCart, isLoading } = useCart();
  const storeId = items[0]?.storeId;
  const storeName = items[0]?.storeName || "Your store";
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [itemToRemove, setItemToRemove] = useState<string | null>(null);
  const [itemNameToRemove, setItemNameToRemove] = useState("");
  const [feeInfoType, setFeeInfoType] = useState<FeeInfoType | null>(null);

  const {
      loading: storeLoading,
      isOpen: isStoreOpen,
      error: storeError,
    } = useCartStoreStatus({
      storeId,
    });

    const {
      subtotal,
      deliveryFee,
      originalDeliveryFee,
      serviceFee,
      tax,
      total,
      amountUntilFreeDelivery,
      hasFreeDelivery,
      isCalculatingDelivery,
      deliveryError,
    } = useCartPricing({
      subtotal: totalPrice,
      storeId,
    });

  /*
   * This is an early customer-facing check. The checkout callable repeats
   * the comparison with trusted product prices, so it cannot be bypassed by
   * stale cart data or a modified browser request.
   */
  const minimumOrder =
    (marketplacePolicy?.defaultMinimumOrderCents ?? 0) / 100;

  const amountUntilMinimumOrder =
    Math.max(
      0,
      minimumOrder - subtotal,
    );

  const meetsMinimumOrder =
    amountUntilMinimumOrder === 0;

  // Always stay in the customer workspace, including from direct links.
  const goBack = () => {
    router.push(storeId ? `/store/${storeId}` : "/home");
  };

  // Proceed to checkout
  const handleCheckout = () => {
    router.push("/checkout");
  };

  // Handle remove item with confirmation
  const handleRemoveItem = (itemId: string, itemName: string) => {
    setItemToRemove(itemId);
    setItemNameToRemove(itemName);
    setShowRemoveConfirm(true);
  };

  // Confirm remove item
  const confirmRemoveItem = () => {
    if (itemToRemove) {
      removeItem(itemToRemove);
      setShowRemoveConfirm(false);
      setItemToRemove(null);
      setItemNameToRemove("");
    }
  };

  // Cancel remove item
  const cancelRemoveItem = () => {
    setShowRemoveConfirm(false);
    setItemToRemove(null);
    setItemNameToRemove("");
  };

  // Handle quantity decrease with confirmation if quantity is 1
  const handleDecreaseQuantity = (itemId: string, currentQuantity: number, itemName: string) => {
    if (currentQuantity === 1) {
      setItemToRemove(itemId);
      setItemNameToRemove(itemName);
      setShowRemoveConfirm(true);
    } else {
      updateQuantity(itemId, currentQuantity - 1);
    }
  };

  // ✅ Show loading state
  if (
  isLoading ||
  storeLoading ||
  isCalculatingDelivery
) {
    return <CustomerPageSkeleton variant="cart" />;
  }

  // Empty state
  if (items.length === 0) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center p-4">
        {/* Back button in empty state */}
        <button
          onClick={goBack}
          className="fixed top-4 left-4 z-10 p-2 bg-white rounded-full shadow-md hover:shadow-lg transition"
          aria-label="Go back"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-sm mx-auto"
        >
          {/* Empty State Illustration */}
          <div className="relative w-48 h-48 mx-auto mb-8">
            <div className="absolute inset-0 bg-orange-100 rounded-full opacity-20 scale-150" />
            <div className="relative w-full h-full flex items-center justify-center">
              <ShoppingCart className="w-24 h-24 text-orange-300" />
              <motion.div
                animate={{
                  y: [0, -10, 0],
                }}
                transition={{
                  repeat: Infinity,
                  duration: 2,
                  ease: "easeInOut",
                }}
                className="absolute -top-2 -right-2 w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center"
              >
                <span className="text-2xl">🛒</span>
              </motion.div>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Your cart is empty
          </h2>
          <p className="text-gray-500 text-sm mb-8">
            Looks like you haven&apos;t added anything to your cart yet.
            Browse our stores and discover amazing African groceries!
          </p>

          <Link
            href="/home"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold rounded-xl hover:shadow-lg hover:from-orange-600 hover:to-orange-700 transition"
          >
            <ShoppingBag className="w-5 h-5" />
            Start Shopping
          </Link>

          <div className="mt-8 flex flex-col gap-3 text-sm text-gray-400">
            <div className="flex items-center justify-center gap-2">
              <Truck className="w-4 h-4" />
              <span>
                Free delivery on orders of $
                {((marketplacePolicy?.freeDeliveryMinimumCents ?? 0) / 100).toFixed(2)}
                {" "}or more
              </span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Clock className="w-4 h-4" />
              <span>Fresh groceries delivered in 30-45 min</span>
            </div>
          </div>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      {/* Header with Back Button - Matching Notifications Page Style */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-xl">
        <div className="relative flex items-center px-4 py-4 max-w-2xl mx-auto">
          <button
            onClick={goBack}
            className="p-2 hover:bg-gray-100 rounded-full transition"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="pointer-events-none absolute inset-x-0 text-center text-xl font-bold text-gray-800">Cart</h1>
          <span className="ml-auto text-xs text-gray-400">
            {itemCount} item{itemCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* One cart belongs to one store. Keep its items together like a store basket. */}
      <div className="mx-auto max-w-2xl px-4 py-5 pb-64">
        <section className="overflow-hidden rounded-[26px] border border-gray-200 bg-transparent">
          <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-4">
            <div className="min-w-0">
              <h2 className="truncate text-base font-extrabold text-gray-900">{storeName}</h2>
              <p className="mt-0.5 text-sm font-medium text-gray-500">
                ${subtotal.toFixed(2)} subtotal
              </p>
            </div>
            {storeId && (
              <button
                type="button"
                onClick={() => router.push(`/store/${storeId}`)}
                className="shrink-0 rounded-full border border-orange-200 bg-orange-50 px-3.5 py-2 text-xs font-bold text-orange-700 transition hover:border-orange-300 hover:bg-orange-100"
              >
                Add items
              </button>
            )}
          </div>

          <div className="divide-y divide-gray-100">
            <AnimatePresence mode="popLayout">
              {items.map((item) => {
            const productName =
              formatProductName(item.name);

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                layout
                className="px-4 py-4"
              >
                <div className="flex gap-3">
                  {/* Product Image */}
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-gray-50">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={productName}
                        fill
                        sizes="80px"
                        className="object-contain p-1"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ShoppingCart className="w-8 h-8 text-gray-300" />
                      </div>
                    )}
                  </div>

                  {/* Product Info */}
                  <div className="flex-1 min-w-0">
                    <div className="min-w-0">
                        <h4 className="font-sans text-sm font-bold leading-5 text-gray-900">
                          {productName}
                        </h4>
                        {item.size && item.size.value > 0 && (
                          <p className="mt-0.5 text-xs text-gray-500">
                            {item.size.value}{item.size.unit}
                          </p>
                        )}
                    </div>

                    {/* Price & Quantity Controls */}
                    <div className="mt-0.5 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                      <div>
                        {typeof item.originalPrice === "number" &&
                          item.originalPrice > item.price && (
                            <span className="mr-1.5 text-xs text-gray-400 line-through">
                              ${item.originalPrice.toFixed(2)}
                            </span>
                          )}
                        <ProductPrice price={item.price} className="font-bold text-gray-900" />
                      </div>

                      <div className="flex items-center rounded-full border border-gray-200 bg-white p-1 shadow-sm">
                        <button
                          onClick={() => handleDecreaseQuantity(item.id, item.quantity, productName)}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-red-600 transition hover:bg-red-50 hover:text-red-700"
                          aria-label={
                            item.quantity === 1
                              ? `Remove ${productName} from cart`
                              : `Decrease ${productName} quantity`
                          }
                        >
                          {item.quantity === 1 ? (
                            <Trash2 className="h-4 w-4" />
                          ) : (
                            <Minus className="h-4 w-4" />
                          )}
                        </button>
                        <span className="w-7 text-center text-sm font-bold text-gray-900">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          disabled={
                            typeof item.stock === "number" &&
                            item.quantity >= item.stock
                          }
                          className="flex h-8 w-8 items-center justify-center rounded-full text-orange-600 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:text-gray-300"
                          aria-label={`Increase ${productName} quantity`}
                          title={
                            typeof item.stock === "number" &&
                            item.quantity >= item.stock
                              ? "Maximum available quantity reached"
                              : undefined
                          }
                        >
                          <Plus className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
              })}
            </AnimatePresence>
          </div>
        </section>
      </div>

      {/* Order Summary */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-30">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="text-gray-800">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <button
                type="button"
                onClick={() => setFeeInfoType("delivery")}
                className="inline-flex items-center gap-1 text-gray-500 transition hover:text-gray-800"
                aria-label="Learn about the delivery fee"
              >
                Delivery Fee
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
              </button>

              {hasFreeDelivery ? (
                <span className="flex items-center gap-2 font-medium text-gray-800">
                  <span className="text-gray-400 line-through">
                    ${originalDeliveryFee.toFixed(2)}
                  </span>
                  <span>$0.00</span>
                </span>
              ) : (
                <span className="text-gray-800">
                  ${deliveryFee.toFixed(2)}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <button
                type="button"
                onClick={() => setFeeInfoType("service")}
                className="inline-flex items-center gap-1 text-gray-500 transition hover:text-gray-800"
                aria-label="Learn about the service fee"
              >
                Service Fee
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <span className="text-gray-800">
                ${serviceFee.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <button
                type="button"
                onClick={() => setFeeInfoType("tax")}
                className="inline-flex items-center gap-1 text-gray-500 transition hover:text-gray-800"
                aria-label="Learn about estimated tax"
              >
                Estimated Tax
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <span className="text-gray-800">${tax.toFixed(2)}</span>
            </div>
            <div className="border-t border-gray-200 pt-2">
              <div className="flex justify-between text-lg font-bold">
                <span className="text-gray-800">Total</span>
                <span className="text-orange-600">${total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {storeError && (
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-center">
              <p className="text-sm text-red-600">
                {storeError}
              </p>
            </div>
          )}

          {deliveryError && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-center text-sm text-amber-800">
              {deliveryError}
            </div>
          )}

          {!storeError && !isStoreOpen && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
              <p className="text-sm font-medium text-amber-700">
                This store is currently closed. Checkout will be available when it reopens.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={handleCheckout}
            disabled={
              !isStoreOpen ||
              Boolean(storeError) ||
              Boolean(deliveryError) ||
              !meetsMinimumOrder
            }
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 py-3 font-semibold text-white transition hover:from-orange-600 hover:to-orange-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CreditCard className="h-5 w-5" />

            {!isStoreOpen
              ? "Store Closed"
              : storeError
                ? "Store Unavailable"
                : deliveryError
                  ? "Delivery Unavailable"
                  : !meetsMinimumOrder
                    ? "Minimum Order Not Met"
                    : "Proceed to Checkout"}
          </button>

         {hasFreeDelivery && (
            <p className="text-xs text-green-600 text-center mt-2">
              🎉 Free delivery applied!
            </p>
          )}
          {!hasFreeDelivery &&
             amountUntilFreeDelivery > 0 && (
          <p className="text-xs text-gray-400 text-center mt-2">
            Add $
            {amountUntilFreeDelivery.toFixed(2)}
            {" "}more for free delivery
          </p>
        )}
        </div>
      </div>

      {/* Remove Item Confirmation Modal */}
      {showRemoveConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-3xl max-w-sm w-full p-6"
          >
            <div className="text-center">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-orange-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                Remove Item?
              </h3>
              <p className="text-gray-500 text-sm mb-6">
                Are you sure you want to remove <span className="font-semibold text-gray-700">{itemNameToRemove}</span> from your cart?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={cancelRemoveItem}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRemoveItem}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition"
                >
                  Remove
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Clear Cart Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-3xl max-w-sm w-full p-6"
          >
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                Clear Cart?
              </h3>
              <p className="text-gray-500 text-sm mb-6">
                This will remove all items from your cart. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    clearCart();
                    setShowClearConfirm(false);
                  }}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition"
                >
                  Clear Cart
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      <AnimatePresence>
        {feeInfoType && (
          <FeeInfoSheet
            type={feeInfoType}
            estimatedTax={tax}
            onClose={() => setFeeInfoType(null)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

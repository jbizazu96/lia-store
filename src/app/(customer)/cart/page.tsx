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
import { PRICING_CONFIG } from "@/config/pricing";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { BrandedLoader } from "@/components/ui/BrandedLoader";
import {
  ShoppingCart,
  Plus,
  Minus,
  ArrowLeft,
  ShoppingBag,
  Truck,
  Clock,
  CreditCard,
  X,
  AlertCircle,
} from "lucide-react";
import { useCart } from "@/context/CartContext";

export default function CartPage() {
  const router = useRouter();
  const { items, itemCount, totalPrice, updateQuantity, removeItem, clearCart, isLoading } = useCart();
  const storeId = items[0]?.storeId;
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [itemToRemove, setItemToRemove] = useState<string | null>(null);
  const [itemNameToRemove, setItemNameToRemove] = useState("");

  // Format price
  const formatPrice = (price: number) => {
    const dollars = Math.floor(price);
    const cents = Math.round((price - dollars) * 100);
    return { dollars, cents: cents.toString().padStart(2, '0') };
  };

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
      tax,
      total,
      amountUntilFreeDelivery,
      hasFreeDelivery,
    } = useCartPricing({
      subtotal: totalPrice,
    });

  // Go back to previous page
  const goBack = () => {
    router.back();
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
  storeLoading
) {
    return <BrandedLoader message="Loading Cart" />;
  }

  // Empty state
  if (items.length === 0) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
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
            Looks like you haven't added anything to your cart yet.
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
                {PRICING_CONFIG.FREE_DELIVERY_MINIMUM.toFixed(2)}
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
    <main className="min-h-screen bg-gray-50">
      {/* Header with Back Button - Matching Notifications Page Style */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="flex items-center gap-3 px-4 py-4 max-w-2xl mx-auto">
          <button
            onClick={goBack}
            className="p-2 hover:bg-gray-100 rounded-full transition"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-xl font-bold text-gray-800">Cart</h1>
          <span className="text-xs text-gray-400 ml-auto">
            {itemCount} item{itemCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Cart Items */}
      <div className="max-w-2xl mx-auto px-4 py-4 pb-65 space-y-4">
        <AnimatePresence mode="popLayout">
          {items.map((item) => {
            const price = formatPrice(item.price);

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                layout
                className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
              >
                <div className="flex gap-4">
                  {/* Product Image */}
                  <div className="relative w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-white-100">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.name}
                        fill
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
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="font-semibold text-gray-800 text-sm truncate">
                          {item.name}
                        </h4>
                        <p className="text-xs text-gray-500 truncate">
                          {item.storeName}
                        </p>
                        {item.size && item.size.value > 0 && (
                          <p className="text-xs text-gray-400">
                            {item.size.value}{item.size.unit}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleRemoveItem(item.id, item.name)}
                        className="p-1 hover:bg-red-50 rounded-lg transition text-red-400 hover:text-red-600 flex-shrink-0"
                        aria-label={`Remove ${item.name}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Price & Quantity Controls */}
                    <div className="flex items-center justify-between mt-2">
                      <div>
                        <span className="text-base font-bold text-gray-800">
                          ${price.dollars}
                          <sup className="text-xs font-semibold text-gray-600">
                            .{price.cents}
                          </sup>
                        </span>
                        {item.quantity > 1 && (
                          <span className="text-xs text-gray-400 ml-1">
                            × {item.quantity}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 bg-gray-100 rounded-full p-1">
                        <button
                          onClick={() => handleDecreaseQuantity(item.id, item.quantity, item.name)}
                          className="w-7 h-7 rounded-full bg-white shadow-sm flex items-center justify-center hover:bg-gray-50 transition"
                          aria-label={`Decrease ${item.name} quantity`}
                        >
                          <Minus className="w-3.5 h-3.5 text-gray-600" />
                        </button>
                        <span className="w-6 text-center text-sm font-medium text-gray-800">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="w-7 h-7 rounded-full bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600 transition"
                          aria-label={`Increase ${item.name} quantity`}
                        >
                          <Plus className="w-3.5 h-3.5" />
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

      {/* Order Summary */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-30">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="text-gray-800">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Delivery Fee</span>
              <span className="text-gray-800">
                {deliveryFee === 0 ? "Free" : `$${deliveryFee.toFixed(2)}`}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">
                Tax ({PRICING_CONFIG.SALES_TAX_RATE * 100}%)
              </span>
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
              Boolean(storeError)
            }
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 py-3 font-semibold text-white transition hover:from-orange-600 hover:to-orange-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CreditCard className="h-5 w-5" />

            {!isStoreOpen
              ? "Store Closed"
              : storeError
                ? "Store Unavailable"
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
    </main>
  );
}

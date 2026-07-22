"use client";

/*
  Product card with quantity controls and remove confirmation.
  Shows confirmation modal when removing the last item.
*/
import {
  promotionService,
} from "@/services/promotion/promotionService";
import {useState} from "react";
import {motion, AnimatePresence} from "framer-motion";
import Image from "next/image";
import {
  Plus,
  Minus,
  Package,
  AlertCircle,
  LockKeyhole,
} from "lucide-react";
import type { Product } from "@/types/product";

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
  onQuantityChange: (productId: string, quantity: number) => void;
  quantity: number;
}

function formatProductName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(
      /\b\p{L}/gu,
      (letter) => letter.toUpperCase()
    );
}

export function ProductCard({
  product,
  onAddToCart,
  onQuantityChange,
  quantity,
}: ProductCardProps) {
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  // Format price with superscript cents
  const formatPrice = (price: number) => {
    const dollars = Math.floor(price);
    const cents = Math.round((price - dollars) * 100);
    return { dollars, cents: cents.toString().padStart(2, '0') };
  };

  const discountedProductPrice = promotionService.getDiscountedPrice(
    product.price,
    product.promotion
  );
  const salePrice = formatPrice(discountedProductPrice);
  const originalPrice = formatPrice(product.price);
  const isOnSale = discountedProductPrice < product.price;

  // Customer-facing stock label
  const getStockStatus = (stock: number) => {
    if (stock > 20) return {label: "Many in stock", color: "text-green-600"};
    if (stock > 5) return {label: "Few left", color: "text-yellow-600"};
    if (stock > 0) return {label: "Last chance", color: "text-orange-600"};
    return {label: "Out of stock", color: "text-red-600"};
  };

  const stockStatus = getStockStatus(product.stock);

  // Format sold count
  const formatSoldCount = (count: number) => {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k+`;
    if (count > 0) return `${count}+`;
    return "";
  };

  // ✅ Handle decrease with confirmation
  const handleDecrease = () => {
    if (quantity === 1) {
      // Show confirmation modal when removing the last item
      setShowRemoveConfirm(true);
    } else if (quantity > 0) {
      onQuantityChange(product.id, quantity - 1);
    }
  };

  // ✅ Confirm remove
  const confirmRemove = () => {
    onQuantityChange(product.id, 0);
    setShowRemoveConfirm(false);
  };

  // ✅ Cancel remove
  const cancelRemove = () => {
    setShowRemoveConfirm(false);
  };

  const handleIncrease = () => {
    onQuantityChange(product.id, quantity + 1);
  };

  const handleAdd = () => {
    onAddToCart(product);
  };

  const isInCart = quantity > 0;

  return (
    <>
      <motion.div
        whileHover={{y: -2}}
        className="w-[135px] flex-shrink-0 font-sans antialiased sm:w-[148px]"
      >
            {/* Product Image */}
            <div className="relative h-[104px] w-full overflow-hidden rounded-2xl bg-gray-100">
              {product.imageUrl ? (
                <Image
                  src={product.imageUrl}
                  alt={formatProductName(product.name)}
                  fill
                  sizes="(max-width: 640px) 135px, 148px"
                  className="scale-[1.15] object-contain p-1"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Package className="h-10 w-10 text-gray-300" />
                </div>
              )}

              <div className="absolute left-1.5 top-1.5 flex flex-col items-start gap-1">
                {isInCart && (
                  <span className="rounded-full bg-green-600 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white shadow-sm">
                    Added
                  </span>
                )}

                {isOnSale && (
                  <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white shadow-sm">
                    On sale
                  </span>
                )}
              </div>

              {isInCart ? (
                <div className="absolute bottom-2 right-2 flex h-9 items-center rounded-full bg-white p-0.5 shadow-lg">
                  <button
                    type="button"
                    onClick={handleDecrease}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-orange-600 transition hover:bg-orange-50"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="min-w-4 text-center text-xs font-bold text-gray-800">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={handleIncrease}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-orange-600 transition hover:bg-orange-50"
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleAdd}
                  className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-900 shadow-lg transition hover:scale-105 hover:bg-orange-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
                  aria-label={`Add ${formatProductName(product.name)} to cart`}
                >
                  <Plus className="h-5 w-5" strokeWidth={2.5} />
                </button>
              )}
            </div>

        {/* Product Info */}
        <div className="pt-2">
          {promotionService.isActive(
            product.promotion
          ) && (
            <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-orange-50 px-1.5 py-0.5 text-[9px] font-semibold text-orange-700">
              <LockKeyhole className="h-3 w-3 shrink-0" />
              {promotionService.getLabel(
                product.promotion
              )}
            </span>
          )}

          {/* Product price */}
          <div className="mt-1 flex items-end gap-1.5">
            <span className={`inline-flex items-baseline whitespace-nowrap text-base font-black leading-none tracking-tight ${isOnSale ? "text-red-600" : "text-gray-900"}`}>
              <span className="relative -top-1 mr-px text-[11px] font-bold leading-none">
                $
              </span>
              <span>{salePrice.dollars}</span>
              <span className="relative -top-1 text-[11px] font-bold leading-none">
                .{salePrice.cents}
              </span>
            </span>
            {isOnSale && (
              <span className="pb-0.5 text-[10px] text-gray-400 line-through">
                ${originalPrice.dollars}.{originalPrice.cents}
              </span>
            )}
          </div>

          {/* Size/Weight */}
          {product.size && product.size.value > 0 && (
            <p className="mt-1 text-xs font-medium text-gray-500">
              {product.size.value} {product.size.unit}
            </p>
          )}

          {/* Product Name */}
          <h4 className="mt-0.5 line-clamp-2 text-xs font-semibold leading-4 text-gray-900">
            {formatProductName(product.name)}
          </h4>

          {/* Stock Status */}
          <p className={`mt-1 flex items-center gap-1.5 text-[10px] font-medium ${stockStatus.color}`}>
            <span className="h-2 w-2 rounded-full bg-current" />
            {stockStatus.label}
          </p>

          {(product.soldCount ?? 0) > 0 && (
            <p className="mt-0.5 text-[10px] font-medium text-gray-500">
              {formatSoldCount(product.soldCount ?? 0)} recently sold
            </p>
          )}
        </div>
      </motion.div>

      {/* ✅ Remove Confirmation Modal */}
      <AnimatePresence>
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
                  Are you sure you want to remove <span className="font-semibold text-gray-700">{product.name}</span> from your cart?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={cancelRemove}
                    className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmRemove}
                    className="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

"use client";

/*
|--------------------------------------------------------------------------
| Customer Product Card
|--------------------------------------------------------------------------
|
| Displays one customer-facing product.
|
| Card behavior:
|
| - Clicking the card opens the Product Details page.
| - Clicking Add, Increase, or Decrease changes the cart without navigating.
| - Removing the final unit requires confirmation.
|
*/

import {
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import Image from "next/image";

import {
  AnimatePresence,
  motion,
} from "framer-motion";

import {
  AlertCircle,
  LockKeyhole,
  Minus,
  Package,
  Plus,
  Trash2,
} from "lucide-react";

import {
  productImageSelector,
} from "@/services/product/productImageSelector";

import {
  promotionService,
} from "@/services/promotion/promotionService";

import {
  ProductPrice,
} from "@/components/ui/ProductPrice";

import {
  formatProductName,
  formatProductPrice,
} from "@/utils/productDisplay";

import type {
  MouseEvent,
} from "react";

import type {
  Product,
} from "@/types/product";

/*
|--------------------------------------------------------------------------
| Props
|--------------------------------------------------------------------------
*/

interface ProductCardProps {
  product: Product;

  onAddToCart: (
    product: Product
  ) => void;

  onQuantityChange: (
    productId: string,
    quantity: number
  ) => void;

  quantity: number;
}

/*
|--------------------------------------------------------------------------
| Stock Status
|--------------------------------------------------------------------------
*/

function getStockStatus(
  stock: number
): {
  label: string;
  color: string;
} {
  if (stock > 20) {
    return {
      label:
        "Many in stock",

      color:
        "text-green-600",
    };
  }

  if (stock > 5) {
    return {
      label:
        "Few left",

      color:
        "text-yellow-600",
    };
  }

  if (stock > 0) {
    return {
      label:
        "Last chance",

      color:
        "text-orange-600",
    };
  }

  return {
    label:
      "Not available",

    color:
      "text-gray-500",
  };
}

/*
|--------------------------------------------------------------------------
| Sold Count
|--------------------------------------------------------------------------
*/

function formatSoldCount(
  count: number
): string {
  if (count >= 1000) {
    return (
      `${(
        count / 1000
      ).toFixed(1)}k+`
    );
  }

  if (count > 0) {
    return `${count}+`;
  }

  return "";
}

/*
|--------------------------------------------------------------------------
| Component
|--------------------------------------------------------------------------
*/

export function ProductCard({
  product,
  onAddToCart,
  onQuantityChange,
  quantity,
}: ProductCardProps) {
  const router =
    useRouter();

  const [
    showRemoveConfirm,
    setShowRemoveConfirm,
  ] = useState(false);

  /*
  |--------------------------------------------------------------------------
  | Product Values
  |--------------------------------------------------------------------------
  */

  const discountedProductPrice =
    promotionService
      .getDiscountedPrice(
        product.price,
        product.promotion
      );

  const originalPrice =
    formatProductPrice(
      product.price
    );

  const isOnSale =
    discountedProductPrice <
    product.price;

  const isInCart =
    quantity > 0;

  const isOutOfStock =
    product.stock <= 0;

  const stockStatus =
    getStockStatus(
      product.stock
    );

  /*
  |--------------------------------------------------------------------------
  | Navigation
  |--------------------------------------------------------------------------
  */

  const openProductPage =
    () => {
      router.push(
        `/product/${product.id}`
      );
    };

  const handleCardKeyDown = (
    event:
      React.KeyboardEvent<HTMLDivElement>
  ) => {
    if (
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();

      openProductPage();
    }
  };

  /*
  |--------------------------------------------------------------------------
  | Stop Card Navigation
  |--------------------------------------------------------------------------
  |
  | Every cart action stops the click from reaching the clickable card.
  |
  */

  const stopCardClick = (
    event:
      MouseEvent<HTMLElement>
  ) => {
    event.stopPropagation();
  };

  /*
  |--------------------------------------------------------------------------
  | Cart Actions
  |--------------------------------------------------------------------------
  */

  const handleDecrease = (
    event:
      MouseEvent<HTMLButtonElement>
  ) => {
    stopCardClick(
      event
    );

    if (quantity === 1) {
      setShowRemoveConfirm(
        true
      );

      return;
    }

    if (quantity > 1) {
      onQuantityChange(
        product.id,
        quantity - 1
      );
    }
  };

  const handleIncrease = (
    event:
      MouseEvent<HTMLButtonElement>
  ) => {
    stopCardClick(
      event
    );

    if (
      quantity >=
      product.stock
    ) {
      return;
    }

    onQuantityChange(
      product.id,
      quantity + 1
    );
  };

  const handleAdd = (
    event:
      MouseEvent<HTMLButtonElement>
  ) => {
    stopCardClick(
      event
    );

    onAddToCart(
      product
    );
  };

  /*
  |--------------------------------------------------------------------------
  | Remove Confirmation
  |--------------------------------------------------------------------------
  */

  const confirmRemove = (
    event:
      MouseEvent<HTMLButtonElement>
  ) => {
    stopCardClick(
      event
    );

    onQuantityChange(
      product.id,
      0
    );

    setShowRemoveConfirm(
      false
    );
  };

  const cancelRemove = (
    event:
      MouseEvent<HTMLButtonElement>
  ) => {
    stopCardClick(
      event
    );

    setShowRemoveConfirm(
      false
    );
  };

  /*
  |--------------------------------------------------------------------------
  | Product Card
  |--------------------------------------------------------------------------
  */

  return (
    <>
      <motion.div
        role="link"
        tabIndex={0}
        aria-label={`View ${formatProductName(
          product.name
        )}`}
        onClick={
          openProductPage
        }
        onKeyDown={
          handleCardKeyDown
        }
        whileHover={
          isOutOfStock
            ? undefined
            : {
                y: -2,
              }
        }
        className={`w-[135px] flex-shrink-0 cursor-pointer font-sans antialiased outline-none transition focus-visible:rounded-2xl focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 sm:w-[148px] ${
          isOutOfStock
            ? "opacity-60"
            : ""
        }`}
      >
        {/*
        |--------------------------------------------------------------------------
        | Product Image
        |--------------------------------------------------------------------------
        */}

        <div className="relative h-[104px] w-full overflow-hidden rounded-2xl bg-gray-100">
          {product.imageUrl ? (
            <Image
              src={
                productImageSelector
                  .getUrl(
                    product,
                    "card"
                  )
              }
              alt={
                formatProductName(
                  product.name
                )
              }
              fill
              sizes="(max-width: 640px) 135px, 148px"
              className={`scale-[1.15] object-contain p-2 ${
                isOutOfStock
                  ? "grayscale"
                  : ""
              }`}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-10 w-10 text-gray-300" />
            </div>
          )}

          {/*
          |--------------------------------------------------------------------------
          | Product Badges
          |--------------------------------------------------------------------------
          */}

          <div className="absolute left-1.5 top-1.5 flex flex-col items-start gap-1">
            {isInCart &&
              !isOutOfStock && (
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

          {/*
          |--------------------------------------------------------------------------
          | Cart Controls
          |--------------------------------------------------------------------------
          */}

          {isOutOfStock ? (
            <span className="absolute bottom-2 right-2 rounded-full bg-gray-700 px-2 py-1 text-[8px] font-bold uppercase tracking-wide text-white shadow-sm">
              Unavailable
            </span>
          ) : isInCart ? (
            <div
              className="absolute bottom-2 right-2 flex h-9 items-center rounded-full bg-white p-0.5 shadow-lg"
              onClick={
                stopCardClick
              }
            >
              <button
                type="button"
                onClick={
                  handleDecrease
                }
                className="flex h-8 w-8 items-center justify-center rounded-full text-orange-600 transition hover:bg-orange-50"
                aria-label={
                  quantity === 1
                    ? "Remove from cart"
                    : "Decrease quantity"
                }
              >
                {quantity === 1 ? (
                  <Trash2 className="h-3.5 w-3.5" />
                ) : (
                  <Minus className="h-3 w-3" />
                )}
              </button>

              <span className="min-w-4 text-center text-xs font-bold text-gray-800">
                {quantity}
              </span>

              <button
                type="button"
                onClick={
                  handleIncrease
                }
                disabled={
                  quantity >=
                  product.stock
                }
                className="flex h-8 w-8 items-center justify-center rounded-full text-orange-600 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Increase quantity"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={
                handleAdd
              }
              className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-900 shadow-lg transition hover:scale-105 hover:bg-orange-500 hover:text-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
              aria-label={`Add ${formatProductName(
                product.name
              )} to cart`}
            >
              <Plus
                className="h-5 w-5"
                strokeWidth={
                  2.5
                }
              />
            </button>
          )}
        </div>

        {/*
        |--------------------------------------------------------------------------
        | Product Information
        |--------------------------------------------------------------------------
        */}

        <div className="pt-2">
          {promotionService
            .isActive(
              product.promotion
            ) && (
            <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-orange-50 px-1.5 py-0.5 text-[9px] font-semibold text-orange-700">
              <LockKeyhole className="h-3 w-3 shrink-0" />

              {promotionService
                .getLabel(
                  product.promotion
                )}
            </span>
          )}

          {/* Product price */}
          <div className="mt-1 flex items-end gap-1.5">
            <ProductPrice
              price={
                discountedProductPrice
              }
              className={
                isOnSale
                  ? "text-red-600"
                  : "text-gray-900"
              }
            />

            {isOnSale && (
              <span className="pb-0.5 text-[10px] text-gray-400 line-through">
                $
                {
                  originalPrice.dollars
                }
                .
                {
                  originalPrice.cents
                }
              </span>
            )}
          </div>

          {/* Size */}
          {product.size &&
            product.size.value >
              0 && (
              <p className="mt-1 text-xs font-medium text-gray-500">
                {
                  product.size.value
                }{" "}
                {
                  product.size.unit
                }
              </p>
            )}

          {/* Name */}
          <h4 className="mt-0.5 line-clamp-2 text-xs font-semibold leading-4 text-gray-900">
            {formatProductName(
              product.name
            )}
          </h4>

          {/* Stock */}
          <p
            className={`mt-1 flex items-center gap-1.5 text-[10px] font-medium ${stockStatus.color}`}
          >
            <span className="h-2 w-2 rounded-full bg-current" />

            {
              stockStatus.label
            }
          </p>

          {(product.soldCount ??
            0) > 0 && (
            <p className="mt-0.5 text-[10px] font-medium text-gray-500">
              {formatSoldCount(
                product.soldCount ??
                  0
              )}{" "}
              recently sold
            </p>
          )}
        </div>
      </motion.div>

      {/*
      |--------------------------------------------------------------------------
      | Remove Confirmation Modal
      |--------------------------------------------------------------------------
      */}

      <AnimatePresence>
        {showRemoveConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={(
              event
            ) => {
              event.stopPropagation();

              setShowRemoveConfirm(
                false
              );
            }}
          >
            <motion.div
              initial={{
                opacity: 0,
                scale: 0.95,
              }}
              animate={{
                opacity: 1,
                scale: 1,
              }}
              exit={{
                opacity: 0,
                scale: 0.95,
              }}
              onClick={(
                event
              ) =>
                event.stopPropagation()
              }
              className="w-full max-w-sm rounded-3xl bg-white p-6"
            >
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100">
                  <AlertCircle className="h-8 w-8 text-orange-600" />
                </div>

                <h3 className="mb-2 text-xl font-bold text-gray-800">
                  Remove Item?
                </h3>

                <p className="mb-6 text-sm text-gray-500">
                  Are you sure you want
                  to remove{" "}
                  <span className="font-semibold text-gray-700">
                    {product.name}
                  </span>{" "}
                  from your cart?
                </p>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={
                      cancelRemove
                    }
                    className="flex-1 rounded-xl border border-gray-200 py-3 font-medium text-gray-600 transition hover:bg-gray-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={
                      confirmRemove
                    }
                    className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white transition hover:bg-red-700"
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
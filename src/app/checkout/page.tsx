"use client";

/*
|--------------------------------------------------------------------------
| Checkout Page
|--------------------------------------------------------------------------
|
| Coordinates the checkout UI.
|
| Responsibilities moved into hooks:
|
| - useCheckout:
|   Loads the customer, address, and store.
|
| - useCheckoutPricing:
|   Calculates distance, delivery fee, tax, tip, and total.
|
| - useCheckoutAddress:
|   Validates, geocodes, and saves an address.
|
| - usePlaceOrder:
|   Creates the order and clears the cart.
|
*/

import {
  getStoreStatus,
} from "@/services/store/storeSchedule";

import {
  useEffect,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import {
  AnimatePresence,
} from "framer-motion";

import {
  AlertCircle,
  CreditCard,
} from "lucide-react";

import {
  useCart,
} from "@/context/CartContext";

import {
  useCheckout,
} from "@/hooks/useCheckout";

import {
  useCheckoutAddress,
} from "@/hooks/useCheckoutAddress";

import {
  useCheckoutPricing,
} from "@/hooks/useCheckoutPricing";

import {
  usePlaceOrder,
} from "@/hooks/usePlaceOrder";

import {
  AddressModal,
} from "@/components/checkout/AddressModal";

import {
  CheckoutHeader,
} from "@/components/checkout/CheckoutHeader";

import {
  DeliveryAddressSection,
} from "@/components/checkout/DeliveryAddressSection";

import {
  DeliveryInstructions,
} from "@/components/checkout/DeliveryInstructions";

import {
  OrderSuccess,
} from "@/components/checkout/OrderSuccess";

import {
  OrderSummary,
} from "@/components/checkout/OrderSummary";

import {
  TipSelector,
} from "@/components/checkout/TipSelector";

import type {
  CheckoutItem,
} from "./types";

/*
|--------------------------------------------------------------------------
| Page
|--------------------------------------------------------------------------
*/

export default function CheckoutPage() {
  const router = useRouter();

  /*
  |--------------------------------------------------------------------------
  | Cart
  |--------------------------------------------------------------------------
  */

  const {
    items,
    totalPrice,
    clearCart,
  } = useCart();

  const storeId =
    items[0]?.storeId;

  /*
  |--------------------------------------------------------------------------
  | Checkout Data
  |--------------------------------------------------------------------------
  */

  const {
    address,
    store,
    userName,
    userPhone,
    formData,
    showAddressModal,
    loading: checkoutLoading,
    error: checkoutError,
    isAuthenticated,
    setAddress,
    setUserName,
    setUserPhone,
    setFormData,
    setShowAddressModal,
    setError: setCheckoutError,
  } = useCheckout({
    storeId,
  });

  /*
  |--------------------------------------------------------------------------
  | Local Checkout State
  |--------------------------------------------------------------------------
  */

  const [
    deliveryInstructions,
    setDeliveryInstructions,
  ] = useState("");

  const [
    tip,
    setTip,
  ] = useState(0);

  /*
  |--------------------------------------------------------------------------
  | Pricing
  |--------------------------------------------------------------------------
  */

  const {
    distanceMiles,
    estimatedDeliveryMinutes,
    total,
    totals,
  } = useCheckoutPricing({
    subtotal: totalPrice,
    tip,
    store,
    address,
  });

  /*
  |--------------------------------------------------------------------------
  | Address Saving
  |--------------------------------------------------------------------------
  */

  const {
    loading: addressLoading,
    error: addressError,
    saveAddress,
    clearError: clearAddressError,
  } = useCheckoutAddress();

  /*
  |--------------------------------------------------------------------------
  | Order Creation
  |--------------------------------------------------------------------------
  */

  const {
    loading: orderLoading,
    error: orderError,
    orderPlaced,
    orderId,
    placeOrder,
    clearError: clearOrderError,
  } = usePlaceOrder({
    items: items as CheckoutItem[],
    store,
    address,
    userName,
    userPhone,
    deliveryInstructions,
    distanceMiles,
    estimatedDeliveryMinutes,
    totals,
    clearCart,
  });

  /*
  |--------------------------------------------------------------------------
  | Combined UI State
  |--------------------------------------------------------------------------
  */

  const loading =
    checkoutLoading ||
    addressLoading ||
    orderLoading;

  const storeStatus =
  store
    ? getStoreStatus(
        store.schedule,
        store.isOpen
      )
    : null;

const isStoreClosed =
  storeStatus !== null &&
  !storeStatus.isOpen;

  const error =
    orderError ||
    addressError ||
    checkoutError;

  /*
  |--------------------------------------------------------------------------
  | Authentication Redirect
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (
      checkoutLoading ||
      isAuthenticated
    ) {
      return;
    }

    router.replace("/login");
  }, [
    checkoutLoading,
    isAuthenticated,
    router,
  ]);

  /*
  |--------------------------------------------------------------------------
  | Empty Cart Redirect
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (
      items.length === 0 &&
      !orderPlaced
    ) {
      router.replace("/home");
    }
  }, [
    items.length,
    orderPlaced,
    router,
  ]);

  /*
  |--------------------------------------------------------------------------
  | Successful Order Redirect
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (!orderPlaced) {
      return;
    }

    const timeoutId =
      window.setTimeout(() => {
        router.push("/orders");
      }, 3000);

    return () => {
      window.clearTimeout(
        timeoutId
      );
    };
  }, [
    orderPlaced,
    router,
  ]);

  /*
  |--------------------------------------------------------------------------
  | Clear Errors
  |--------------------------------------------------------------------------
  */

  const clearErrors = () => {
    setCheckoutError(null);
    clearAddressError();
    clearOrderError();
  };

  /*
  |--------------------------------------------------------------------------
  | Open Address Modal
  |--------------------------------------------------------------------------
  */

  const openAddressModal = () => {
    clearErrors();
    setShowAddressModal(true);
  };

  /*
  |--------------------------------------------------------------------------
  | Close Address Modal
  |--------------------------------------------------------------------------
  */

  const closeAddressModal = () => {
    clearErrors();
    setShowAddressModal(false);
  };

  /*
  |--------------------------------------------------------------------------
  | Save Address
  |--------------------------------------------------------------------------
  */

  const handleSaveAddress =
    async (
      event: React.FormEvent
    ) => {
      event.preventDefault();

      clearErrors();

      const savedAddress =
        await saveAddress(
          formData
        );

      if (!savedAddress) {
        return;
      }

      setAddress(savedAddress);
      setUserName(formData.name);
      setUserPhone(formData.phone);
      setShowAddressModal(false);
    };

  /*
  |--------------------------------------------------------------------------
  | Place Order
  |--------------------------------------------------------------------------
  */

  const handlePlaceOrder =
    async () => {
      clearErrors();

      if (!address) {
        setCheckoutError(
          "Please add a delivery address."
        );

        setShowAddressModal(true);

        return;
      }

      await placeOrder();
    };

  /*
  |--------------------------------------------------------------------------
  | Redirect States
  |--------------------------------------------------------------------------
  */

  if (
    !checkoutLoading &&
    !isAuthenticated
  ) {
    return null;
  }

  if (
    items.length === 0 &&
    !orderPlaced
  ) {
    return null;
  }

  /*
  |--------------------------------------------------------------------------
  | Success View
  |--------------------------------------------------------------------------
  */

  if (orderPlaced) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <OrderSuccess
          orderId={orderId}
          onViewOrders={() =>
            router.push("/orders")
          }
        />
      </main>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Checkout
  |--------------------------------------------------------------------------
  */

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      <CheckoutHeader
        onBack={() =>
          router.back()
        }
      />

      <div className="mx-auto max-w-lg space-y-4 px-4 py-4">
        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
            <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-500" />

            <p className="text-sm text-red-600">
              {error}
            </p>
          </div>
        )}

        {/* Delivery Address */}
        <DeliveryAddressSection
          address={address}
          userName={userName}
          userPhone={userPhone}
          onEdit={openAddressModal}
        />

        {/* Delivery Instructions */}
        <DeliveryInstructions
          value={
            deliveryInstructions
          }
          onChange={
            setDeliveryInstructions
          }
        />

        {/* Driver Tip */}
        <TipSelector
          selectedTip={tip}
          onTipChange={setTip}
          subtotal={totalPrice}
        />

        {/* Order Summary */}
        <OrderSummary
          items={
            items as CheckoutItem[]
          }
          totals={totals}
          storeName={
            store?.name ??
            items[0]?.storeName ??
            ""
          }
          storeAddress={
            store?.address ?? ""
          }
        />

        {isStoreClosed && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
            <p className="text-sm font-medium text-amber-700">
              This store is currently closed. You can place your order when it reopens.
            </p>
          </div>
        )}

        {/* Place Order */}
        <button
          type="button"
          onClick={handlePlaceOrder}
          disabled={
            loading ||
            isStoreClosed
          }
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 py-3.5 font-semibold text-white transition hover:from-orange-600 hover:to-orange-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : isStoreClosed ? (
            "Store Closed"
          ) : (
            <>
              <CreditCard className="h-5 w-5" />
              Pay ${total.toFixed(2)}
            </>
          )}
        </button>

        <p className="text-center text-xs text-gray-400">
          By placing your order,
          you agree to our Terms of
          Service
        </p>
      </div>

      {/* Address Modal */}
      <AnimatePresence>
        {showAddressModal && (
          <AddressModal
            isOpen={
              showAddressModal
            }
            onClose={
              closeAddressModal
            }
            onSubmit={
              handleSaveAddress
            }
            formData={formData}
            setFormData={
              setFormData
            }
            loading={
              addressLoading
            }
            error={
              addressError ??
              checkoutError ??
              ""
            }
            title="Delivery Information"
          />
        )}
      </AnimatePresence>
    </main>
  );
}
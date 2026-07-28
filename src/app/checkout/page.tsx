"use client";

/*
|--------------------------------------------------------------------------
| Checkout Page
|--------------------------------------------------------------------------
|
| Coordinates the customer checkout experience.
|
| Checkout now has two stages:
|
| 1. Review
|    - Delivery address
|    - Delivery instructions
|    - Driver tip
|    - Order summary
|
| 2. Payment
|    - Stripe Payment Element
|    - Saved payment methods
|    - Save-payment-method consent
|    - Payment confirmation
|
| Important:
|
| This page no longer creates a confirmed order directly.
|
| The backend prepares:
|
| - A payment-pending order
| - A Stripe PaymentIntent
| - A Stripe Customer Session
|
| The future Stripe payment webhook will:
|
| - Confirm successful payment
| - Recheck inventory
| - Deduct stock
| - Confirm the order
| - Notify the store
|
*/

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
  ArrowLeft,
  CreditCard,
  ShieldCheck,
} from "lucide-react";

import {
  DELIVERY_CONFIG,
} from "@/config/delivery";

import {
  getStoreStatus,
} from "@/services/store/storeSchedule";

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
  usePrepareCheckoutPayment,
} from "@/hooks/usePrepareCheckoutPayment";

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
  OrderSummary,
} from "@/components/checkout/OrderSummary";

import {
  StripeCheckout,
} from "@/components/checkout/StripeCheckout";

import {
  TipSelector,
} from "@/components/checkout/TipSelector";

import type {
  CheckoutItem,
} from "./types";


/*
|--------------------------------------------------------------------------
| Checkout Steps
|--------------------------------------------------------------------------
*/

type CheckoutStep =
  | "review"
  | "payment"
  | "payment_submitted";


/*
|--------------------------------------------------------------------------
| Currency
|--------------------------------------------------------------------------
*/

function formatCurrencyFromCents(
  amount: number
): string {
  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
    }
  ).format(
    amount / 100
  );
}


/*
|--------------------------------------------------------------------------
| Page
|--------------------------------------------------------------------------
*/

export default function CheckoutPage() {
  const router =
    useRouter();


  /*
  |--------------------------------------------------------------------------
  | Cart
  |--------------------------------------------------------------------------
  */

  const {
    items,
    totalPrice,
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
    loading:
      checkoutLoading,
    error:
      checkoutError,
    isAuthenticated,
    setAddress,
    setUserName,
    setUserPhone,
    setFormData,
    setShowAddressModal,
    setError:
      setCheckoutError,
  } = useCheckout({
    storeId,
  });


  /*
  |--------------------------------------------------------------------------
  | Local Checkout State
  |--------------------------------------------------------------------------
  */

  const [
    checkoutStep,
    setCheckoutStep,
  ] = useState<CheckoutStep>(
    "review"
  );

  const [
    deliveryInstructions,
    setDeliveryInstructions,
  ] = useState("");

  const [
    tip,
    setTip,
  ] = useState(0);

  const [
    paymentConfirmationError,
    setPaymentConfirmationError,
  ] = useState<string | null>(
    null
  );


  /*
  |--------------------------------------------------------------------------
  | Checkout Pricing Estimate
  |--------------------------------------------------------------------------
  |
  | These values are shown to the customer during review.
  |
  | The Firebase Function independently recalculates the trusted amount
  | before creating the Stripe PaymentIntent.
  |
  */

  const {
    distanceMiles,
    isCalculatingDistance,
    distanceError,
    total,
    totals,
  } = useCheckoutPricing({
    subtotal:
      totalPrice,

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
    loading:
      addressLoading,

    error:
      addressError,

    saveAddress,

    clearError:
      clearAddressError,
  } = useCheckoutAddress();


  /*
  |--------------------------------------------------------------------------
  | Stripe Payment Preparation
  |--------------------------------------------------------------------------
  */

  const {
      loading:
        paymentPreparationLoading,

      error:
        paymentPreparationError,

      preparedPayment,

      preparePayment,

      clearError:
        clearPaymentPreparationError,
    } = usePrepareCheckoutPayment();


  /*
  |--------------------------------------------------------------------------
  | Combined UI State
  |--------------------------------------------------------------------------
  */

  const loading =
    checkoutLoading ||
    addressLoading ||
    paymentPreparationLoading;

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

  const isOutsideDeliveryRadius =
    address !== null &&
    distanceMiles >
      DELIVERY_CONFIG
        .MAX_RADIUS_MILES;

  const isDeliveryDistanceUnavailable =
    address !== null &&
    distanceError !== null;

  const error =
    paymentConfirmationError ||
    paymentPreparationError ||
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

    router.replace(
      "/login"
    );
  }, [
    checkoutLoading,
    isAuthenticated,
    router,
  ]);


  /*
  |--------------------------------------------------------------------------
  | Empty Cart Redirect
  |--------------------------------------------------------------------------
  |
  | Only redirect from the review stage.
  |
  | Once payment has been prepared, the checkout page must remain mounted
  | even if cart state changes unexpectedly.
  |
  */

  useEffect(() => {
    if (
      items.length === 0 &&
      checkoutStep === "review"
    ) {
      router.replace(
        "/home"
      );
    }
  }, [
    checkoutStep,
    items.length,
    router,
  ]);


  /*
  |--------------------------------------------------------------------------
  | Clear Errors
  |--------------------------------------------------------------------------
  */

  const clearErrors =
    () => {
      setCheckoutError(
        null
      );

      setPaymentConfirmationError(
        null
      );

      clearAddressError();

      clearPaymentPreparationError();
    };


  /*
  |--------------------------------------------------------------------------
  | Address Modal
  |--------------------------------------------------------------------------
  */

  const openAddressModal =
    () => {
      clearErrors();

      setShowAddressModal(
        true
      );
    };

  const closeAddressModal =
    () => {
      clearErrors();

      setShowAddressModal(
        false
      );
    };


  /*
  |--------------------------------------------------------------------------
  | Save Address
  |--------------------------------------------------------------------------
  */

  const handleSaveAddress =
    async (
      event:
        React.FormEvent
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

      setAddress(
        savedAddress
      );

      setUserName(
        formData.name
      );

      setUserPhone(
        formData.phone
      );

      setShowAddressModal(
        false
      );
    };


  /*
  |--------------------------------------------------------------------------
  | Continue To Payment
  |--------------------------------------------------------------------------
  */

  const handleContinueToPayment =
    async () => {
      clearErrors();

      /*
        Reuse the payment already prepared during this checkout session.

        This prevents repeated Back → Continue actions from creating duplicate
        pending orders and PaymentIntents.
      */
      if (preparedPayment) {
        setCheckoutStep(
          "payment"
        );

        window.scrollTo({
          top: 0,
          behavior: "smooth",
        });

        return;
      }

      if (!address) {
        setCheckoutError(
          "Please add a delivery address."
        );

        setShowAddressModal(
          true
        );

        return;
      }

      if (!store) {
        setCheckoutError(
          "The selected store could not be loaded."
        );

        return;
      }

      if (!userName.trim()) {
        setCheckoutError(
          "A delivery contact name is required."
        );

        setShowAddressModal(
          true
        );

        return;
      }

      if (!userPhone.trim()) {
        setCheckoutError(
          "A delivery contact phone number is required."
        );

        setShowAddressModal(
          true
        );

        return;
      }

      if (
        address.latitude ===
          undefined ||
        address.longitude ===
          undefined
      ) {
        setCheckoutError(
          "Your delivery address needs valid map coordinates."
        );

        return;
      }

      if (
        isOutsideDeliveryRadius
      ) {
        setCheckoutError(
          "This store is outside your delivery radius. Choose a closer store or use a different delivery address."
        );

        return;
      }

      if (
        isDeliveryDistanceUnavailable
      ) {
        setCheckoutError(
          distanceError ??
          "The delivery route could not be calculated."
        );

        return;
      }

      if (
        items.length === 0
      ) {
        setCheckoutError(
          "Your cart is empty."
        );

        return;
      }

      /*
        Send only customer-selectable values.

        The backend independently loads current product prices, store
        information, Stripe readiness, distance, fees, tax, and total.
      */
      const result =
        await preparePayment({
          storeId:
            store.id,

          contactName:
            userName,

          contactPhone:
            userPhone,

          items:
            items.map(
              (
                item
              ) => ({
                productId:
                  item.id,

                quantity:
                  item.quantity,

                size:
                  item.size ??
                  null,
              })
            ),

          deliveryAddress: {
            street:
              address.street,

            city:
              address.city,

            state:
              address.state,

            zip:
              address.zip,

            latitude:
              address.latitude,

            longitude:
              address.longitude,

            formattedAddress:
              address
                .formattedAddress,
          },

          deliveryInstructions:
            deliveryInstructions
              .trim() ||
            undefined,

          tip,
        });

      if (!result) {
        return;
      }

      setCheckoutStep(
        "payment"
      );

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    };


  /*
  |--------------------------------------------------------------------------
  | Return To Review
  |--------------------------------------------------------------------------
  |
  | This resets only the browser payment UI.
  |
  | The already-created pending order and PaymentIntent remain available
  | for future expiration and cleanup handling.
  |
  */
    const handleReturnToReview =
      () => {
        /*
          Keep the existing prepared payment.

          Returning to the review screen must not create another Firestore
          order or another Stripe PaymentIntent when the customer continues
          again without changing checkout details.
        */
        setPaymentConfirmationError(
          null
        );

        setCheckoutStep(
          "review"
        );

        window.scrollTo({
          top: 0,
          behavior: "smooth",
        });
      };


  /*
  |--------------------------------------------------------------------------
  | Payment Confirmation
  |--------------------------------------------------------------------------
  |
  | Browser confirmation provides immediate customer feedback.
  |
  | The future Stripe webhook remains responsible for marking the order
  | paid, reducing stock, confirming fulfillment, and notifying the store.
  |
  */

  const handlePaymentConfirmed =
    (
      _orderId: string
    ) => {
      setPaymentConfirmationError(
        null
      );

      setCheckoutStep(
        "payment_submitted"
      );

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    };


  const handlePaymentError =
    (
      message: string
    ) => {
      setPaymentConfirmationError(
        message
      );
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
    checkoutStep === "review"
  ) {
    return null;
  }


  /*
  |--------------------------------------------------------------------------
  | Payment Submitted
  |--------------------------------------------------------------------------
  |
  | Do not clear the cart yet.
  |
  | The Stripe webhook must first confirm and activate the order.
  |
  */

  if (
    checkoutStep ===
      "payment_submitted" &&
    preparedPayment
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-3xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <ShieldCheck className="h-8 w-8 text-green-600" />
          </div>

          <h1 className="text-2xl font-bold text-gray-900">
            Payment submitted
          </h1>

          <p className="mt-3 text-sm leading-6 text-gray-500">
            Stripe received your payment. LIA is confirming the payment
            and preparing your order.
          </p>

          <div className="mt-5 rounded-2xl bg-gray-50 p-4">
            <p className="text-xs uppercase tracking-wide text-gray-400">
              Order
            </p>

            <p className="mt-1 font-semibold text-gray-800">
              {
                preparedPayment
                  .orderNumber
              }
            </p>

            <p className="mt-3 text-xs uppercase tracking-wide text-gray-400">
              Payment total
            </p>

            <p className="mt-1 text-xl font-bold text-orange-600">
              {formatCurrencyFromCents(
                preparedPayment
                  .pricing
                  .totalAmount
              )}
            </p>
          </div>

          <p className="mt-4 text-xs leading-5 text-gray-400">
            Your cart will be cleared after the payment webhook confirms
            the order workflow.
          </p>

          <button
            type="button"
            onClick={() =>
              router.push(
                `/orders/${preparedPayment.orderId}`
              )
            }
            className="mt-6 w-full rounded-xl bg-orange-500 py-3 font-semibold text-white transition hover:bg-orange-600"
          >
            View order
          </button>
        </div>
      </main>
    );
  }


  /*
  |--------------------------------------------------------------------------
  | Payment Step
  |--------------------------------------------------------------------------
  */

  if (
    checkoutStep ===
      "payment" &&
    preparedPayment
  ) {
    return (
      <main className="min-h-screen bg-gray-50 pb-8">
        <CheckoutHeader
          onBack={
            handleReturnToReview
          }
        />

        <div className="mx-auto max-w-lg space-y-4 px-4 py-4">
          <button
            type="button"
            onClick={
              handleReturnToReview
            }
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 transition hover:text-orange-600"
          >
            <ArrowLeft className="h-4 w-4" />

            Back to order review
          </button>

          <div className="rounded-2xl border border-orange-100 bg-orange-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-orange-600">
              Trusted payment total
            </p>

            <div className="mt-1 flex items-end justify-between gap-3">
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrencyFromCents(
                    preparedPayment
                      .pricing
                      .totalAmount
                  )}
                </p>

                <p className="mt-1 text-xs text-gray-500">
                  Order{" "}
                  {
                    preparedPayment
                      .orderNumber
                  }
                </p>
              </div>

              <ShieldCheck className="h-6 w-6 text-orange-500" />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-500" />

              <p className="text-sm text-red-600">
                {error}
              </p>
            </div>
          )}

          <StripeCheckout
            orderId={
              preparedPayment
                .orderId
            }
            clientSecret={
              preparedPayment
                .clientSecret
            }
            customerSessionClientSecret={
              preparedPayment
                .customerSessionClientSecret
            }
            totalAmount={
              preparedPayment
                .pricing
                .totalAmount
            }
            onPaymentConfirmed={
              handlePaymentConfirmed
            }
            onPaymentError={
              handlePaymentError
            }
          />
        </div>
      </main>
    );
  }


  /*
  |--------------------------------------------------------------------------
  | Review Step
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
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
            <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-500" />

            <p className="text-sm text-red-600">
              {error}
            </p>
          </div>
        )}

        <DeliveryAddressSection
          address={
            address
          }
          userName={
            userName
          }
          userPhone={
            userPhone
          }
          onEdit={
            openAddressModal
          }
        />

        <DeliveryInstructions
          value={
            deliveryInstructions
          }
          onChange={
            setDeliveryInstructions
          }
        />

        <TipSelector
          selectedTip={
            tip
          }
          onTipChange={
            setTip
          }
          subtotal={
            totalPrice
          }
        />

        <OrderSummary
          items={
            items as
              CheckoutItem[]
          }
          totals={
            totals
          }
          storeName={
            store?.name ??
            items[0]?.storeName ??
            ""
          }
          storeAddress={
            store?.address ??
            ""
          }
        />

        {isStoreClosed && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
            <p className="text-sm font-medium text-amber-700">
              This store is currently closed. You can place your order
              when it reopens.
            </p>
          </div>
        )}

        {isOutsideDeliveryRadius && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
            <p className="text-sm font-medium text-red-700">
              Delivery is unavailable because this store is outside your{" "}
              {
                DELIVERY_CONFIG
                  .MAX_RADIUS_MILES
              }
              -mile delivery radius.
            </p>
          </div>
        )}

        {isDeliveryDistanceUnavailable && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
            <p className="text-sm font-medium text-red-700">
              {distanceError}
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={
            handleContinueToPayment
          }
          disabled={
            loading ||
            isCalculatingDistance ||
            isStoreClosed ||
            isOutsideDeliveryRadius ||
            isDeliveryDistanceUnavailable
          }
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 py-3.5 font-semibold text-white transition hover:from-orange-600 hover:to-orange-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {paymentPreparationLoading ? (
            <>
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />

              Preparing secure payment...
            </>
          ) : isCalculatingDistance ? (
            "Calculating delivery distance..."
          ) : isStoreClosed ? (
            "Store Closed"
          ) : isOutsideDeliveryRadius ? (
            "Delivery Unavailable"
          ) : isDeliveryDistanceUnavailable ? (
            "Delivery Distance Unavailable"
          ) : (
            <>
              <CreditCard className="h-5 w-5" />

              Continue to Payment · $
              {total.toFixed(2)}
            </>
          )}
        </button>

        <p className="text-center text-xs leading-5 text-gray-400">
          The final payment amount is recalculated securely by LIA before
          Stripe opens.
        </p>
      </div>

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
            formData={
              formData
            }
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
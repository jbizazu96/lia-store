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
  useCheckoutPaymentStatus,
} from "@/hooks/useCheckoutPaymentStatus";

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
import {useMarketplacePricingPolicy} from "@/hooks/useMarketplacePricingPolicy";

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
  const marketplacePolicy = useMarketplacePricingPolicy();
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
    userEmail,
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
  ] = useState(3);

  const [
    paymentConfirmationError,
    setPaymentConfirmationError,
  ] = useState<string | null>(
    null
  );

  const [
    isLeavingConfirmation,
    setIsLeavingConfirmation,
  ] = useState(false);


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

    const {
        failureMessage:
          webhookFailureMessage,

        error:
          paymentStatusError,

        isProcessing:
          isWebhookProcessing,

        isConfirmed:
          isWebhookConfirmed,

        hasPaymentFailed:
          hasWebhookPaymentFailed,
      } = useCheckoutPaymentStatus(
        preparedPayment?.checkoutSessionId ??
        null
      );

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
      (marketplacePolicy?.maxRadiusMiles ?? Infinity);

  const isDeliveryDistanceUnavailable =
    address !== null &&
    distanceError !== null;

  const error =
      paymentConfirmationError ||
      paymentStatusError ||
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
  | Webhook-Confirmed Payment
  |--------------------------------------------------------------------------
  |
  | The browser-side Stripe result improves responsiveness, but Firestore
  | written by the verified webhook is the final authority.
  */

  useEffect(() => {
    if (
      !isWebhookConfirmed ||
      !preparedPayment
    ) {
      return;
    }

    queueMicrotask(() => {
      setPaymentConfirmationError(
        null
      );

      setCheckoutStep(
        "payment_submitted"
      );
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }, [
    isWebhookConfirmed,
    preparedPayment,
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
        /*
          Stripe.js successfully submitted the payment.

          Do not show final success yet.

          The verified Stripe webhook must first:

          - Confirm the payment
          - Recheck inventory
          - Deduct stock
          - Activate the order
          - Confirm the checkout session

          The realtime Firestore listener will move checkout to the success
          screen after those server-side operations finish.
        */
        setPaymentConfirmationError(
          null
        );
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
| Leave Payment Confirmation
|--------------------------------------------------------------------------
|
| The confirmed cart remains available while the customer reviews the
| success screen.
|
| It is cleared only when the customer leaves checkout.
|
*/

const handleViewOrder =
  async () => {
    if (
      !preparedPayment ||
      isLeavingConfirmation
    ) {
      return;
    }

    setIsLeavingConfirmation(
      true
    );

    try {
      /*
        Clear both:

        - The cart in React state
        - The persisted Firestore cart
      */
      await clearCart();
    } catch (
      clearCartError: unknown
    ) {
      /*
        Payment and order confirmation already succeeded.

        A cart-cleanup failure must not block the customer from viewing
        the paid order.
      */
      console.error(
        "The order was confirmed, but the cart could not be cleared:",
        {
          orderId:
            preparedPayment.orderId,

          clearCartError,
        }
      );
    } finally {
      router.push(
        `/orders/${preparedPayment.orderId}`
      );
    }
  };


  const handleContinueShopping =
    async () => {
      if (
        isLeavingConfirmation
      ) {
        return;
      }

      setIsLeavingConfirmation(
        true
      );

      try {
        await clearCart();
      } catch (
        clearCartError: unknown
      ) {
        console.error(
          "The order was confirmed, but the cart could not be cleared:",
          {
            orderId:
              preparedPayment?.orderId ??
              null,

            clearCartError,
          }
        );
      } finally {
        router.push(
          "/home"
        );
      }
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
      <main className="flex min-h-screen items-center justify-center bg-white p-4">
        <div className="w-full max-w-md rounded-3xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <ShieldCheck className="h-8 w-8 text-green-600" />
          </div>

          <h1 className="text-2xl font-bold text-gray-900">
            Payment confirmed
          </h1>

          <p className="mt-3 text-sm leading-6 text-gray-500">
            Your payment was successful, and your order has been sent to the
            store for preparation.
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
            You can follow preparation and delivery updates from your order page.
          </p>

          <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={
              handleViewOrder
            }
            disabled={
              isLeavingConfirmation
            }
            className="w-full rounded-xl bg-orange-500 py-3 font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLeavingConfirmation
              ? "Finishing..."
              : "View Order"}
          </button>

          <button
            type="button"
            onClick={
              handleContinueShopping
            }
            disabled={
              isLeavingConfirmation
            }
            className="w-full rounded-xl border border-gray-200 bg-white py-3 font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continue Shopping
          </button>
        </div>
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
      <main className="min-h-screen bg-white pb-8">
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

          {hasWebhookPaymentFailed && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />

                <div>
                  <p className="font-semibold text-red-700">
                    Payment unsuccessful
                  </p>

                  <p className="mt-1 text-sm leading-5 text-red-600">
                    {webhookFailureMessage ??
                      "Your payment method could not be accepted. Please choose another payment method and try again."}
                  </p>

                  <p className="mt-2 text-xs text-red-500">
                    Your order has not been sent to the store. Select another payment method and retry.
                  </p>
                </div>
              </div>
            </div>
          )}

          {isWebhookProcessing && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="font-medium text-blue-700">
                Processing payment...
              </p>

              <p className="mt-1 text-sm text-blue-600">
                Stripe is confirming your payment. Please keep this page open.
              </p>
            </div>
          )}

          <StripeCheckout
            orderId={
              preparedPayment
                .orderId
            }
            checkoutSessionId={
              preparedPayment
                .checkoutSessionId
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
            customerEmail={
              userEmail
            }
            customerPhone={
              userPhone
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
    <main className="min-h-screen bg-white pb-40">
      <CheckoutHeader
        onBack={() =>
          router.push("/cart")
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
                marketplacePolicy?.maxRadiusMiles
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

      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200/80 bg-white/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto max-w-lg">
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
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 py-3.5 font-semibold text-white transition hover:from-orange-600 hover:to-orange-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
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
                Continue to Payment · ${total.toFixed(2)}
              </>
            )}
          </button>
          <p className="mt-2 text-center text-xs leading-5 text-gray-400">
            The final payment amount is recalculated securely by LIA before Stripe opens.
          </p>
        </div>
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

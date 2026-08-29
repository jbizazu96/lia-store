"use client";

/*
  Order detail page - Shows full order information with server timestamps.
  ✅ Real-time updates using Firestore onSnapshot
*/

import {
  formatOrderDate,
  formatOrderPrice,
  getCurrentOrderStep,
  getStatusTimestamp,
} from "@/utils/orderDisplay";
import {
  ORDER_STATUS_CONFIG,
  ORDER_STATUS_STEPS,
} from "@/config/orderStatus";
import { useCustomerOrder } from "@/hooks/useCustomerOrder";
import {useRouter} from "next/navigation";
import { use, useEffect, useState } from "react";
import Image from "next/image";
import {
  formatProductName,
} from "@/utils/productDisplay";
import {
  ArrowLeft,
  MapPin,
  Package,
  CreditCard,
  Store,
  Receipt,
  ShoppingCart,
} from "lucide-react";
import { CustomerPageSkeleton } from "@/components/customer/ui/CustomerPageSkeleton";
import { OrderHelpSection } from "@/components/customer/orders/OrderHelpSection";
import { StoreReviewPrompt } from "@/components/customer/orders/StoreReviewPrompt";
import { DeliveryProofCard } from "@/components/customer/orders/DeliveryProofCard";
import { useCart } from "@/context/CartContext";
import { useConfirmation } from "@/context/ConfirmationContext";
import { useSuccessToast } from "@/context/SuccessToastContext";
import {getCustomerPickupCode} from "@/services/order/customerPickupService";
import {ScheduledFulfillmentNotice} from "@/components/orders/ScheduledFulfillmentNotice";


interface OrderPageProps {
  params: Promise<{
    orderId: string;
  }>;
}


export default function OrderDetailPage({params}: OrderPageProps) {
  const {orderId} = use(params);
  const router = useRouter();
  const { items: cartItems, repeatCompletedOrder } = useCart();
  const { confirm } = useConfirmation();
  const { showSuccess } = useSuccessToast();
  const [repeatingOrder, setRepeatingOrder] = useState(false);
  const [repeatOrderError, setRepeatOrderError] = useState("");
  const [pickupCodeResult, setPickupCodeResult] = useState<{orderId: string; code: string} | null>(null);
  const {
      order,
      loading,
      error,
      isAuthenticated,
    } = useCustomerOrder({
      orderId,
    });

  useEffect(() => {
    if (order?.fulfillmentType !== "pickup" || order.status !== "ready_for_pickup") {
      return;
    }
    let active = true;
    void getCustomerPickupCode(order.id)
      .then((code) => { if (active) setPickupCodeResult({orderId: order.id, code}); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [order?.fulfillmentType, order?.id, order?.status]);

  const handleReturn = () => {
    router.push("/orders");
  };

  // Get status config
  const getStatusConfig = (
      status: string
    ) => {
      if (
        status in
        ORDER_STATUS_CONFIG
      ) {
        return ORDER_STATUS_CONFIG[
          status as keyof typeof ORDER_STATUS_CONFIG
        ];
      }

  return ORDER_STATUS_CONFIG.pending;
};




  if (!loading && !isAuthenticated) {
    router.push("/login");
    return null;
  }

  if (loading) {
    return <CustomerPageSkeleton variant="order-detail" />;
  }

  if (error || !order) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 text-lg">{error || "Order not found"}</p>
          <button
            onClick={() => router.push("/orders")}
            className="mt-4 px-6 py-2 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 transition"
          >
            Back to Orders
          </button>
        </div>
      </main>
    );
  }

  const statusConfig = getStatusConfig(order.status);
  const StatusIcon = statusConfig.icon;
  
  // ✅ Calculate which steps are completed
  const currentStepIndex =
    getCurrentOrderStep(
      order.status
    );

  /*
  |--------------------------------------------------------------------------
  | Cancelled Order Timeline
  |--------------------------------------------------------------------------
  |
  | "cancelled" is not a fulfillment step, so it must not reset the visual
  | timeline. For a cancelled order, status history is the source of truth
  | for the steps the store already completed.
  |
  */
  const isCancelled =
    order.status === "cancelled";

  const cancellationTimestamp =
    getStatusTimestamp(
      order.statusHistory,
      "cancelled"
    );

  const cancellationReason =
    order.cancellationReason?.trim() ||
    "The store did not provide a cancellation reason.";

  const iscompleted = (index: number) => index <= currentStepIndex;

  const handleRepeatOrder = async () => {
    if (repeatingOrder) return;
    setRepeatOrderError("");

    if (cartItems.length > 0) {
      const confirmed = await confirm({
        title: "Replace current cart?",
        message: "Your current cart will be replaced with the available items from this completed order.",
        confirmLabel: "Order again",
        cancelLabel: "Keep cart",
      });

      if (!confirmed) return;
    }

    setRepeatingOrder(true);
    try {
      const result = await repeatCompletedOrder(order.id);
      const skipped = result.skippedProductNames;

      showSuccess(
        skipped.length > 0
          ? `Your cart was updated. Unavailable: ${skipped.join(", ")}.`
          : "Your cart is ready for another order.",
      );
      router.push("/cart");
    } catch (cause) {
      setRepeatOrderError(
        cause instanceof Error
          ? cause.message
          : "Unable to repeat this order right now.",
      );
    } finally {
      setRepeatingOrder(false);
    }
  };

  return (
    <main className="min-h-screen bg-white pb-8">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="relative flex items-center px-4 py-4 max-w-lg mx-auto">
          <button
            onClick={handleReturn}
            className="p-2 hover:bg-gray-100 rounded-full transition"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="pointer-events-none absolute inset-x-20 text-center text-xl font-bold text-gray-800">Order Details</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Order Status Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_6px_18px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`px-4 py-2 rounded-xl flex items-center gap-2 ${statusConfig.color}`}>
                <StatusIcon className="w-5 h-5" />
                <span className="font-semibold">{statusConfig.label}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Order Placed</p>
              <p className="text-sm font-medium text-gray-700">{formatOrderDate(order.createdAt)}</p>
            </div>
          </div>
        </div>

        {order.status === "completed" && (
          <div className="space-y-2">
            <button
              type="button"
              disabled={repeatingOrder}
              onClick={() => void handleRepeatOrder()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 px-5 py-4 font-bold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ShoppingCart className="h-5 w-5" />
              {repeatingOrder ? "Adding available items…" : "Order again"}
            </button>
            {repeatOrderError && (
              <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {repeatOrderError}
              </p>
            )}
          </div>
        )}

        {isCancelled && (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
              </div>
              <div>
                <h3 className="font-semibold text-red-800">Order cancellation reason</h3>
                <p className="mt-1 text-sm leading-6 text-red-700">
                  {cancellationReason}
                </p>
              </div>
            </div>
          </div>
        )}

        {order.fulfillmentType === "pickup" && order.status === "ready_for_pickup" && (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5 text-center shadow-sm">
            <p className="text-sm font-bold text-orange-900">Your order is ready for pickup</p>
            <p className="mt-1 text-xs text-orange-700">Show this code to the store only after you receive your order.</p>
            <p className="mt-4 font-mono text-3xl font-black tracking-[0.3em] text-orange-700">
              {pickupCodeResult?.orderId === order.id ? pickupCodeResult.code : "••••••"}
            </p>
          </div>
        )}

        <OrderHelpSection
          orderId={orderId}
          canRequestRefund={order.status === "completed" || isCancelled}
          fulfillmentType={order.fulfillmentType}
          fulfillmentFailureOnly={isCancelled}
        />

        {order.status === "completed" && (
          <StoreReviewPrompt
            orderId={order.id}
            storeName={order.store.name || "this store"}
          />
        )}

        {/* ✅ Full Order Timeline with Server Timestamps */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_6px_18px_rgba(15,23,42,0.08)]">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="font-semibold text-gray-800">Order Timeline</h3>
          </div>
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-4 top-6 bottom-6 w-0.5 bg-gray-200" />
            
            <div className="space-y-6">
              {ORDER_STATUS_STEPS
                .filter((step) => order.fulfillmentType !== "pickup" || step.key !== "out_for_delivery")
                .map((step, index) => {
                const Icon = step.icon;
                const timestamp =
                  getStatusTimestamp(
                    order.statusHistory,
                    step.key
                  );

                /*
                 * A cancelled order has no matching step in
                 * ORDER_STATUS_STEPS. Preserve the already recorded
                 * fulfillment steps instead of treating all of them as
                 * unfinished.
                 */
                const completed =
                  isCancelled
                    ? Boolean(timestamp)
                    : iscompleted(index);
                
                return (
                  <div key={step.key} className="flex items-start gap-4 relative">
                    {/* Status dot */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${
                      completed ? "bg-green-500" : "bg-gray-200"
                    }`}>
                      <Icon className={`w-4 h-4 ${completed ? "text-white" : "text-gray-400"}`} />
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 pt-0.5">
                      <div className="flex items-center gap-2">
                        <p className={`font-medium text-sm ${completed ? "text-gray-800" : "text-gray-400"}`}>
                          {order.fulfillmentType === "pickup" && step.key === "ready_for_pickup"
                            ? "Ready for your pickup"
                            : step.label}
                        </p>
                        {step.key === order.status && (
                          <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">
                            Current
                          </span>
                        )}
                      </div>
                      {timestamp ? (
                        <p className="text-xs text-gray-400">
                          {formatOrderDate(timestamp)}
                        </p>
                      ) : !completed && step.key === order.status ? (
                        <p className="text-xs text-orange-500 font-medium">In progress...</p>
                      ) : !completed ? (
                        <p className="text-xs text-gray-400">Pending</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}

              {isCancelled && (
                <div className="flex items-start gap-4 relative">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 bg-red-500">
                    <StatusIcon className="w-4 h-4 text-white" />
                  </div>

                  <div className="flex-1 pt-0.5">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm text-red-700">
                        Order Cancelled
                      </p>
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                        Current
                      </span>
                    </div>

                    {cancellationTimestamp && (
                      <p className="text-xs text-gray-400">
                        {formatOrderDate(cancellationTimestamp)}
                      </p>
                    )}

                    <p className="mt-1 text-xs leading-5 text-red-700">
                      Reason: {cancellationReason}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Store Info */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_6px_18px_rgba(15,23,42,0.08)]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
              <Store className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-800">{order.store.name}</h3>
              {order.store.address && (
                <p className="text-xs text-gray-500">{order.store.address}</p>
              )}
            </div>
          </div>
          
          
        </div>

        <ScheduledFulfillmentNotice order={order} />

        {/* Fulfillment location */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_6px_18px_rgba(15,23,42,0.08)]">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-5 h-5 text-orange-500" />
            <h3 className="font-semibold text-gray-800">
              {order.fulfillmentType === "pickup" ? "Pickup Location" : "Delivery Address"}
            </h3>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-sm text-gray-800">
              {order.fulfillmentType === "pickup" ? order.store.address : order.customer.address}
            </p>
            {order.fulfillmentType === "pickup" && order.pickup?.instructions && (
              <p className="mt-2 text-xs text-gray-500">{order.pickup.instructions}</p>
            )}
          </div>
        </div>

        {order.fulfillmentType === "delivery" && order.status === "completed" && (
          <DeliveryProofCard
            orderId={order.id}
          />
        )}

        {/* Order Items */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_6px_18px_rgba(15,23,42,0.08)]">
          <div className="flex items-center gap-2 mb-3">
            <Receipt className="w-5 h-5 text-orange-500" />
            <h3 className="font-semibold text-gray-800">Order Items</h3>
            <span className="text-xs text-gray-400 ml-auto">{order.items.length} items</span>
          </div>
          <div className="space-y-3">
            {order.items.map((item) => {
              const price = formatOrderPrice(item.price);
              const totalPrice = formatOrderPrice(item.price * item.quantity);
              return (
                <div key={item.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                  <div className="relative w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 bg-white border border-gray-100">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={formatProductName(item.name)}
                        fill
                        sizes="56px"
                        className="object-contain p-1"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-6 h-6 text-gray-300" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate">
                      {formatProductName(item.name)}
                    </p>
                    {item.size && item.size.value > 0 && (
                      <p className="text-xs text-gray-400">{item.size.value} {item.size.unit}</p>
                    )}
                    <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-800 text-sm">
                      ${totalPrice.dollars}
                      <sup className="text-[10px] font-semibold text-gray-600">.{totalPrice.cents}</sup>
                    </p>
                    <p className="text-[10px] text-gray-400">
                      ${price.dollars}
                      <sup>.{price.cents}</sup> each
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payment Summary */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_6px_18px_rgba(15,23,42,0.08)]">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="w-5 h-5 text-orange-500" />
            <h3 className="font-semibold text-gray-800">Payment Summary</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="text-gray-800">${order.pricing.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">{order.fulfillmentType === "pickup" ? "Pickup fee" : "Delivery Fee"}</span>
              <span className="text-gray-800">{order.pricing.deliveryFee === 0 ? "Free" : `$${order.pricing.deliveryFee.toFixed(2)}`}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Service Fee</span>
              <span className="text-gray-800">${order.pricing.serviceFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Tax</span>
              <span className="text-gray-800">${order.pricing.tax.toFixed(2)}</span>
            </div>
            {order.pricing.tip > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Driver Tip</span>
                <span className="text-gray-800">${order.pricing.tip.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200">
              <span className="text-gray-800">Total</span>
              <span className="text-orange-600">${order.pricing.total.toFixed(2)}</span>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}

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
import { use } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  MapPin,
  Package,
  CreditCard,
  Store,
  Receipt,
} from "lucide-react";
import { BrandedLoader } from "@/components/ui/BrandedLoader";


interface OrderPageProps {
  params: Promise<{
    orderId: string;
  }>;
}


export default function OrderDetailPage({params}: OrderPageProps) {
  const {orderId} = use(params);
  const router = useRouter();
  const {
      order,
      loading,
      error,
      isAuthenticated,
    } = useCustomerOrder({
      orderId,
    });

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
    return <BrandedLoader message="Loading Order Details" />;
  }

  if (error || !order) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
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
  const iscompleted = (index: number) => index <= currentStepIndex;

  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="flex items-center gap-3 px-4 py-4 max-w-lg mx-auto">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-full transition"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-xl font-bold text-gray-800">Order Details</h1>
          <span className="text-xs text-gray-400 ml-auto">
            #{order.id.slice(0, 8).toUpperCase()}
          </span>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Order Status Card */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
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

        {order.cancellationReason?.trim() && (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
              </div>
              <div>
                <h3 className="font-semibold text-red-800">Order cancellation reason</h3>
                <p className="mt-1 text-sm leading-6 text-red-700">
                  {order.cancellationReason}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ✅ Full Order Timeline with Server Timestamps */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="font-semibold text-gray-800">Order Timeline</h3>
          </div>
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-4 top-6 bottom-6 w-0.5 bg-gray-200" />
            
            <div className="space-y-6">
              {ORDER_STATUS_STEPS.map((step, index) => {
                const completed = iscompleted(index);
                const Icon = step.icon;
                const timestamp =
                  getStatusTimestamp(
                    order.statusHistory,
                    step.key
                  );
                
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
                          {step.label}
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
            </div>
          </div>
        </div>

        {/* Store Info */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
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

        {/* Delivery Address */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-5 h-5 text-orange-500" />
            <h3 className="font-semibold text-gray-800">Delivery Address</h3>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-sm text-gray-800">
              {order.customer.address}
            </p>
          </div>
        </div>

        {/* Order Items */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
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
                        alt={item.name}
                        fill
                        className="object-contain p-1"
                        sizes="56px"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-6 h-6 text-gray-300" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate">{item.name}</p>
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
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
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
              <span className="text-gray-500">Delivery Fee</span>
              <span className="text-gray-800">{order.pricing.deliveryFee === 0 ? "Free" : `$${order.pricing.deliveryFee.toFixed(2)}`}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Tax</span>
              <span className="text-gray-800">${order.pricing.tax.toFixed(2)}</span>
            </div>
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

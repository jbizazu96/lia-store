"use client";

/*
  Store Order Detail Page
  Location: /store/store-orders/[orderId]
  ✅ Full timeline visible to store
  ✅ Store only can update: pending → accepted → preparing → ready_for_pickup
  ✅ LIA handles: out_for_delivery → completed
*/

import {
  formatOrderCurrency,
  formatOrderDate,
  getCurrentOrderStep,
  getStatusTimestamp,
} from "@/utils/orderDisplay";
import {
  ORDER_STATUS_CONFIG,
  ORDER_STATUS_STEPS,
} from "@/config/orderStatus";
import { useStoreOrder } from "@/hooks/useStoreOrder";
import {
  use,
  useState,
} from "react";
import type { Order } from "@/types/order";
import {useRouter} from "next/navigation";
import {
  ArrowLeft,
  User,
  Phone,
  MapPin,
  Receipt,
  Printer,
  AlertCircle,
  Calendar,
  Store,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { orderService } from "@/services/order/orderService";
import { BrandedLoader } from "@/components/ui/BrandedLoader";
import {
  formatProductName,
} from "@/utils/productDisplay";

interface OrderDetailsPageProps {
  params: Promise<{
    orderId: string;
  }>;
}

export default function OrderDetailsPage({params}: OrderDetailsPageProps) {
  const {orderId} = use(params);
  const router = useRouter();
  const {
      order,
      loading,
      error,
      isAuthenticated,
      refreshOrder,
    } = useStoreOrder({
      orderId,
    });
  const [updating, setUpdating] = useState(false);
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");


  // ✅ Handle status update - Store can only update up to ready_for_pickup
  const handleStatusUpdate = async (
    newStatus: Order["status"],
    reason?: string
  ) => {

    if (!order) return;

    try {
      setUpdating(true);
      
      // Accepting an order is a business action.
      //
      // Later this method will:
      //
      // • Update Firestore
      // • Create the Shipday delivery
      // • Save the Shipday order ID
      // • Notify the customer
      //
      // The page doesn't need to know any of that.
      await orderService.updateStatus(
        order.id,
        newStatus,
        reason
      );

      await refreshOrder();
      
      
    } catch (error) {
      console.error("Error updating order:", error);
      alert("Failed to update order status");
    } finally {
      setUpdating(false);
    }
  };

  const handleCancellationConfirm = async () => {
    const reason = cancellationReason.trim();

    if (!reason) return;

    await handleStatusUpdate("cancelled", reason);
    setShowCancellationModal(false);
    setCancellationReason("");
  };

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

  // ✅ Calculate store total (products + tax only)
  const storeTotal = (order?.pricing.subtotal || 0) + (order?.pricing.tax || 0);

  if (!loading && !isAuthenticated) {
    router.push("/login");
    return null;
  }

  if (loading) {
    return <BrandedLoader message="Loading Order Details" />;
  }

  if (error || !order) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500 text-lg">{error || "Order not found"}</p>
        <Link
          href="/store/store-orders"
          className="mt-4 inline-block px-6 py-2 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 transition"
        >
          Back to Orders
        </Link>
      </div>
    );
  }

  const currentStepIndex =
  getCurrentOrderStep(
    order.status
  );
  const statusConfig = getStatusConfig(order.status);
  const StatusIcon = statusConfig.icon;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/store/store-orders"
          className="p-2 hover:bg-gray-100 rounded-xl transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Order #{order.id.slice(0, 8).toUpperCase()}
          </h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${statusConfig.color}`}>
              <StatusIcon className="w-3.5 h-3.5" />
              {statusConfig.label}
            </span>
            <span className="text-sm text-gray-400">
              <Calendar className="w-3.5 h-3.5 inline mr-1" />
             {formatOrderDate(
                order.createdAt
              )} 
            </span>
            <span className="text-sm text-gray-400">
              <Store className="w-3.5 h-3.5 inline mr-1" />
              {order.items.length} items
            </span>
          </div>
        </div>
        <button className="ml-auto px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition flex items-center gap-2">
          <Printer className="w-4 h-4" />
          Print
        </button>
      </div>

      {/* ✅ Full Timeline - Store can see all statuses */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between">
          {ORDER_STATUS_STEPS.map((step, index) => {
            const iscompleted = index <= currentStepIndex;
            const Icon = step.icon;
            const timestamp =
              getStatusTimestamp(
                order.statusHistory,
                step.key
              );

            return (
              <div key={step.key} className="flex-1 flex items-center">
                <div className={`flex flex-col items-center flex-1 ${index > 0 ? "ml-[-8px]" : ""}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    iscompleted ? "bg-green-500" : "bg-gray-200"
                  }`}>
                    <Icon className={`w-5 h-5 ${iscompleted ? "text-white" : "text-gray-400"}`} />
                  </div>
                  <p className={`text-xs font-medium mt-1 ${
                    iscompleted ? "text-gray-800" : "text-gray-400"
                  }`}>
                    {step.label}
                  </p>
                  {timestamp && (
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {formatOrderDate(timestamp)}
                    </p>
                  )}
                </div>
                {index < ORDER_STATUS_STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 ${
                    index < currentStepIndex ? "bg-green-500" : "bg-gray-200"
                  }`} />
                )}
              </div>
            );
          })}
        </div>
        {/* ✅ Note about LIA handling delivery */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center">
            📦 LIA handles delivery. Updates for "Out for Delivery" and "completed" are automatic.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Order Items & Notes */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Items */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <Receipt className="w-5 h-5 text-orange-500" />
              <h3 className="font-bold text-gray-800">Order Items</h3>
              <span className="text-xs text-gray-400 ml-auto">{order.items.length} items</span>
            </div>
            <div className="divide-y divide-gray-100">
              {order.items.map((item, index) => {
                const itemTotal = (item.price || 0) * (item.quantity || 1);
                return (
                  <div key={index} className="py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                        {item.imageUrl ? (
                          <Image
                            src={item.imageUrl}
                            alt={
                              formatProductName(
                                item.name || "Ordered product"
                              )
                            }
                            fill
                            sizes="48px"
                            className="object-contain p-1"
                          />
                        ) : (
                          <Receipt className="absolute inset-0 m-auto h-5 w-5 text-gray-300" />
                        )}
                      </div>
                      <span className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-sm font-medium text-gray-600">
                        {item.quantity || 1}
                      </span>
                      <div>
                        <p className="font-medium text-gray-800">
                          {formatProductName(
                            item.name || "Unnamed Item"
                          )}
                        </p>
                        <p className="text-sm text-gray-500">${(item.price || 0).toFixed(2)} each</p>
                      </div>
                    </div>
                    <p className="font-bold text-gray-800">
                      {formatOrderCurrency(itemTotal)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column - Sidebar */}
        <div className="space-y-6">
          {/* Customer Info */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-4">Customer</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">{order.customer.name}</span>
              </div>
              {order.customer.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">{order.customer.phone}</span>
                </div>
              )}
              {order.customer.address && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                  <span className="text-gray-600">{order.customer.address}</span>
                </div>
              )}
            </div>
          </div>

          {/* ✅ Payment Summary - Store View (No Delivery Fee) */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-4">Payment Summary</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal (Products)</span>
                <span className="text-gray-800">${(order.pricing.subtotal || 0).toFixed(2)}</span>
              </div>
              {/* ✅ DELIVERY FEE REMOVED - Handled by LIA */}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tax</span>
                <span className="text-gray-800">${(order.pricing.tax || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200">
                <span className="text-gray-800">Store Total</span>
                <span className="text-green-600">${storeTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* ✅ Actions - Store can only update up to ready_for_pickup */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-4">Actions</h3>
            <div className="space-y-2">
              {order.status === "pending" && (
                <button
                  onClick={() =>
                    handleStatusUpdate("accepted")
                  }
                  disabled={updating}
                  className="w-full px-4 py-3 bg-green-500 text-white font-semibold rounded-xl hover:bg-green-600 transition disabled:opacity-50"
                >
                  Accept Order
                </button>
              )}
              {order.status === "accepted" && (
                <button
                  onClick={() => handleStatusUpdate("preparing")}
                  disabled={updating}
                  className="w-full px-4 py-3 bg-blue-500 text-white font-semibold rounded-xl hover:bg-blue-600 transition disabled:opacity-50"
                >
                  Start Preparing
                </button>
              )}
              {order.status === "preparing" && (
                <button
                  onClick={() => handleStatusUpdate("ready_for_pickup")}
                  disabled={updating}
                  className="w-full px-4 py-3 bg-purple-500 text-white font-semibold rounded-xl hover:bg-purple-600 transition disabled:opacity-50"
                >
                  Ready for Pickup
                </button>
              )}
              {/* ✅ Statuses after ready_for_pickup - Read-only (LIA handles) */}
              {order.status === "ready_for_pickup" && (
                <div className="text-center text-indigo-600 font-medium py-2 bg-indigo-50 rounded-xl">
                  ⏳ Waiting for LIA driver assignment
                </div>
              )}
              {order.status === "out_for_delivery" && (
                <div className="text-center text-blue-600 font-medium py-2 bg-blue-50 rounded-xl">
                  🚚 Order out for delivery
                </div>
              )}
              {order.status === "completed" && (
                <div className="text-center text-green-600 font-medium py-2 bg-green-50 rounded-xl">
                  ✅ Order completed successfully
                </div>
              )}
              {order.status === "cancelled" && (
                <div className="rounded-xl bg-red-50 p-3 text-center text-red-600">
                  <p className="font-medium">Order Cancelled</p>
                  {order.cancellationReason && (
                    <p className="mt-1 text-xs text-red-500">
                      Reason: {order.cancellationReason}
                    </p>
                  )}
                </div>
              )}
              {!["cancelled", "completed", "out_for_delivery", "ready_for_pickup"].includes(order.status) && (
                <button
                  onClick={() => setShowCancellationModal(true)}
                  disabled={updating}
                  className="w-full px-4 py-3 border border-red-200 text-red-600 font-semibold rounded-xl hover:bg-red-50 transition disabled:opacity-50"
                >
                  Cancel Order
                </button>
              )}
            </div>
            {/* ✅ Note about LIA */}
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center">
                🚚 LIA handles delivery. Status updates after "Ready for Pickup" are automatic.
              </p>
            </div>
          </div>
        </div>
      </div>

      {showCancellationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="cancellation-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="cancellation-title" className="text-xl font-bold text-gray-800">Cancel order?</h2>
            <p className="mt-2 text-sm text-gray-500">Tell the customer why this order is being cancelled. This reason will be saved with the order.</p>
            <label htmlFor="cancellation-reason" className="mt-5 block text-sm font-medium text-gray-700">Cancellation reason</label>
            <textarea
              id="cancellation-reason"
              value={cancellationReason}
              onChange={(event) => setCancellationReason(event.target.value)}
              placeholder="For example: An item is unavailable."
              rows={4}
              className="mt-2 w-full resize-none rounded-xl border border-gray-200 p-3 text-sm text-gray-800 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
            />
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => { setShowCancellationModal(false); setCancellationReason(""); }} disabled={updating} className="flex-1 rounded-xl border border-gray-200 px-4 py-3 font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-50">Return</button>
              <button type="button" onClick={handleCancellationConfirm} disabled={updating || !cancellationReason.trim()} className="flex-1 rounded-xl bg-red-600 px-4 py-3 font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300">
                {updating ? "Cancelling..." : "Confirm cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

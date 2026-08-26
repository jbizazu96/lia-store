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
  displayOrderNumber,
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
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import {
  OrderActions,
} from "@/components/store/orders/OrderActions";
import { orderService } from "@/services/order/orderService";
import { BrandedLoader } from "@/components/ui/BrandedLoader";
import {
  formatProductName,
} from "@/utils/productDisplay";
import {
  OrderInvestigationNotice,
} from "@/components/store/orders/OrderInvestigationNotice";
import {useStoreWorkspace} from "@/context/StoreWorkspaceContext";

interface OrderDetailsPageProps {
  params: Promise<{
    orderId: string;
  }>;
}

export default function OrderDetailsPage({params}: OrderDetailsPageProps) {
  const {entry} = useStoreWorkspace();
  const staffUser = entry?.access.role === "staff";
  const readOnly = staffUser && entry.access.permissions.orders === "read";
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
      alert(error instanceof Error ? error.message : "Failed to update order status");
    } finally {
      setUpdating(false);
    }
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
            Order {displayOrderNumber(order.orderNumber)}
          </h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${statusConfig.color}`}>
              <StatusIcon className="w-3.5 h-3.5" />
              {statusConfig.label}
            </span>
            <span className="text-sm text-gray-400">
              <Calendar className="w-3.5 h-3.5 inline mr-1" />
             {formatOrderDate(
                order.payment?.paidAt ?? order.createdAt
              )} 
            </span>
            <span className="text-sm text-gray-400">
              <Store className="w-3.5 h-3.5 inline mr-1" />
              {order.items.length} products · {order.items.reduce((total, item) => total + Math.max(0, item.quantity || 0), 0)} units
            </span>
          </div>
        </div>
        <button type="button" onClick={() => window.print()} className="print:hidden ml-auto px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition flex items-center gap-2">
          <Printer className="w-4 h-4" />
          Print
        </button>
      </div>

      {/* ✅ Full Timeline - Store can see all statuses */}
      <OrderInvestigationNotice
        investigation={order.liaInvestigation}
      />

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between">
          {ORDER_STATUS_STEPS
            .filter((step) => order.fulfillmentType !== "pickup" || step.key !== "out_for_delivery")
            .map((step, index) => {
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
                  {order.fulfillmentType === "pickup" && step.key === "ready_for_pickup"
                    ? "Ready for customer pickup"
                    : step.label}
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
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center">
            {order.fulfillmentType === "pickup"
              ? "Customer pickup: ask for the six-digit pickup code before completing the order. Shipday is not used."
              : "LIA handles delivery. Out for Delivery and Completed updates are automatic."}
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
              {order.fulfillmentType === "delivery" && order.customer.address && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                  <span className="text-gray-600">{order.customer.address}</span>
                </div>
              )}
              {order.fulfillmentType === "pickup" && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-orange-500 mt-0.5" />
                  <span className="font-medium text-orange-700">Customer will pick up at the store</span>
                </div>
              )}
            </div>
          </div>

          {/* Financial details are owner-only. */}
          {!staffUser && <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-4">Store Accounting</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal (Products)</span>
                <span className="text-gray-800">{formatOrderCurrency(order.storeFinancials?.merchandiseSubtotal ?? order.pricing.subtotal)}</span>
              </div>
              {/* ✅ DELIVERY FEE REMOVED - Handled by LIA */}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tax</span>
                <span className="text-gray-800">{formatOrderCurrency(order.storeFinancials?.salesTax ?? order.pricing.tax)}</span>
              </div>
              <div className="flex justify-between border-t border-gray-100 pt-2 text-sm font-medium">
                <span className="text-gray-600">Gross store amount</span>
                <span>{formatOrderCurrency(order.storeFinancials?.grossStoreAmount ?? order.pricing.subtotal + order.pricing.tax)}</span>
              </div>
              {order.storeFinancials?.liaCommission !== null && order.storeFinancials?.liaCommission !== undefined && <div className="flex justify-between text-sm"><span className="text-gray-500">LIA commission</span><span className="text-red-600">−{formatOrderCurrency(order.storeFinancials.liaCommission)}</span></div>}
              {Boolean(order.storeFinancials?.storeRefundReversal) && <div className="flex justify-between text-sm"><span className="text-gray-500">Refund adjustment</span><span className="text-red-600">−{formatOrderCurrency(order.storeFinancials?.storeRefundReversal ?? 0)}</span></div>}
              {Boolean(order.storeFinancials?.refundedMerchandise) && <div className="flex justify-between text-xs"><span className="text-gray-500">Refunded merchandise</span><span>{formatOrderCurrency(order.storeFinancials?.refundedMerchandise ?? 0)}</span></div>}
              {Boolean(order.storeFinancials?.refundedSalesTax) && <div className="flex justify-between text-xs"><span className="text-gray-500">Refunded sales tax</span><span>{formatOrderCurrency(order.storeFinancials?.refundedSalesTax ?? 0)}</span></div>}
              <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200">
                <span className="text-gray-800">Net store earning</span>
                <span className="text-green-600">{order.storeFinancials?.netStoreEarning === null || order.storeFinancials?.netStoreEarning === undefined ? "Pending completion" : formatOrderCurrency(order.storeFinancials.netStoreEarning)}</span>
              </div>
              <div className="mt-3 space-y-1 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                <div className="flex justify-between"><span>Settlement</span><span className="font-medium capitalize">{(order.storeFinancials?.settlementStatus ?? "not_created").replaceAll("_", " ")}</span></div>
                <div className="flex justify-between"><span>Stripe transfer</span><span className="font-medium capitalize">{(order.storeFinancials?.transferStatus ?? "not_created").replaceAll("_", " ")}</span></div>
                {order.storeFinancials?.refundStatus && <div className="flex justify-between"><span>Refund</span><span className="font-medium capitalize">{order.storeFinancials.refundStatus.replaceAll("_", " ")}</span></div>}
              </div>
            </div>
          </div>}

          {!readOnly && <OrderActions
            status={order.status}
            fulfillmentType={order.fulfillmentType}
            onCompletePickup={async (code) => {
              setUpdating(true);
              try {
                await orderService.completePickup(order.id, code);
                await refreshOrder();
              } finally {
                setUpdating(false);
              }
            }}
            cancellationReason={
              order.cancellationReason
            }
            updating={updating}
            onStatusUpdate={
              handleStatusUpdate
            }
          />}
        </div>
      </div>
    </div>
  );
}

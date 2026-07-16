"use client";

/*
  Store Order Detail Page
  Location: /store/store-orders/[orderId]
  ✅ Full timeline visible to store
  ✅ Store only can update: pending → accepted → preparing → ready_for_pickup
  ✅ LIA handles: out_for_delivery → completed
*/


import { mapFirestoreOrder } from "@/mappers/orderMapper";
import type { Order } from "@/types/order";
import {useState, useEffect, use} from "react";
import {useRouter} from "next/navigation";
import {
  ArrowLeft,
  User,
  Phone,
  MapPin,
  Package,
  Clock,
  Truck,
  Receipt,
  Printer,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
  Store,
  DollarSign,
  Box,
  Handshake,
} from "lucide-react";
import {auth, db} from "@/lib/firebase";
import {
  doc,
  getDoc,
} from "firebase/firestore";
import Link from "next/link";
import { orderService } from "@/services/order/orderService";

interface OrderDetailsPageProps {
  params: Promise<{
    orderId: string;
  }>;
}

// ✅ Full status configurations (including delivery statuses for visibility)
const STATUS_CONFIG: Record<string, {label: string; color: string; icon: any}> = {
  pending: {label: "Pending", color: "bg-yellow-100 text-yellow-800", icon: Clock},
  accepted: {label: "Accepted", color: "bg-green-100 text-green-800", icon: CheckCircle},
  preparing: {label: "Preparing", color: "bg-purple-100 text-purple-800", icon: Package},
  ready_for_pickup: {label: "Ready for Pickup", color: "bg-indigo-100 text-indigo-800", icon: Box},
  out_for_delivery: {label: "Out for Delivery", color: "bg-blue-100 text-blue-800", icon: Truck},
  completed: {label: "Completed", color: "bg-green-100 text-green-800", icon: Handshake},
  cancelled: {label: "Cancelled", color: "bg-red-100 text-red-800", icon: XCircle},
};

// ✅ Full timeline with all statuses
const STATUS_STEPS = [
  {key: "pending", label: "Pending", icon: Clock},
  {key: "accepted", label: "Accepted", icon: CheckCircle},
  {key: "preparing", label: "Preparing", icon: Package},
  {key: "ready_for_pickup", label: "Ready for Pickup", icon: Box},
  {key: "out_for_delivery", label: "Out for Delivery", icon: Truck},
  {key: "completed", label: "Completed", icon: Handshake},
];

export default function OrderDetailsPage({params}: OrderDetailsPageProps) {
  const {orderId} = use(params);
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");

  // Fetch order
  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          router.push("/login");
          return;
        }

        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists()) {
          router.push("/store/create");
          return;
        }

        const userData = userDoc.data();
        const storeId = userData.storeId;

        if (!storeId) {
          router.push("/store/create");
          return;
        }
        // Ask the service for the order.
        // The page does not know Firestore anymore.
        const order = await orderService.getOrder(orderId);

        if (!order) {
          setError("Order not found");
          setLoading(false);
          return;
        }

        // Verify this order belongs to the logged-in store.
        if (order.store.id !== storeId) {
          setError("You don't have permission to view this order.");
          setLoading(false);
          return;
        }

        // Save the order into React state.
        setOrder(order);
      } catch (error) {
        console.error("Error fetching order:", error);
        setError("Failed to load order");
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, router]);

  // ✅ Handle status update - Store can only update up to ready_for_pickup
  const handleStatusUpdate = async (newStatus: Order["status"]) => {

    console.log("handleStatusUpdate()", newStatus);
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
        newStatus
      );

      // Use a real Date in the UI state.
      const now = new Date();
      
      setOrder({
        ...order, 
        status: newStatus as Order["status"],
        updatedAt: now,
        statusHistory: [
          ...(order.statusHistory ?? []),
          {
            status: newStatus,
            timestamp: now,
            note: `Order status changed to ${newStatus}`,
          }
        ]
      });
      
    } catch (error) {
      console.error("Error updating order:", error);
      alert("Failed to update order status");
    } finally {
      setUpdating(false);
    }
  };

    const formatDate = (date: Date) => {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "numeric",
      }).format(date);
    };

  const formatPrice = (value: number | undefined) => {
    if (value === undefined || value === null || isNaN(value)) {
      return "$0.00";
    }
    return `$${value.toFixed(2)}`;
  };

  const getStatusTimestamp = ( statusKey: string ): Date | null => {
    if (!order || !order.statusHistory || !Array.isArray(order.statusHistory)) {
      return null;
    }
    const entry = order.statusHistory.find(h => h.status === statusKey);
    return entry?.timestamp ?? null;
  };

  const getStatusConfig = (status: string) => {
    return STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  };

  // ✅ Calculate store total (products + tax only)
  const storeTotal = (order?.pricing.subtotal || 0) + (order?.pricing.tax || 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
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

  const currentStepIndex = STATUS_STEPS.findIndex(s => s.key === order.status);
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
              {formatDate(order.createdAt)}
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
          {STATUS_STEPS.map((step, index) => {
            const iscompleted = index <= currentStepIndex;
            const Icon = step.icon;
            const timestamp = getStatusTimestamp(step.key);

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
                      {formatDate(timestamp)}
                    </p>
                  )}
                </div>
                {index < STATUS_STEPS.length - 1 && (
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
                      <span className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-sm font-medium text-gray-600">
                        {item.quantity || 1}
                      </span>
                      <div>
                        <p className="font-medium text-gray-800">{item.name || "Unnamed Item"}</p>
                        <p className="text-sm text-gray-500">${(item.price || 0).toFixed(2)} each</p>
                      </div>
                    </div>
                    <p className="font-bold text-gray-800">
                      {formatPrice(itemTotal)}
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
                  onClick={() => {
                    console.log("Accept button clicked");
                    handleStatusUpdate("accepted");
                  }}
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
                <div className="text-center text-red-500 font-medium py-2">
                  Order Cancelled
                </div>
              )}
              {!["cancelled", "completed", "out_for_delivery", "ready_for_pickup"].includes(order.status) && (
                <button
                  onClick={() => {
                    if (confirm("Are you sure you want to cancel this order?")) {
                      handleStatusUpdate("cancelled");
                    }
                  }}
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
    </div>
  );
}
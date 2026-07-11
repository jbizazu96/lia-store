"use client";

/*
  Store order detail page.
  Shows full order information for store owners.
  Location: /store/store-orders/[orderId]
*/

import {useState, useEffect, use} from "react";
import {useRouter} from "next/navigation";
import {motion} from "framer-motion";
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
  DollarSign,
  Calendar,
} from "lucide-react";
import {auth, db} from "@/lib/firebase";
import {doc, getDoc, updateDoc} from "firebase/firestore";
import Link from "next/link";

// Types
interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  total: number;
}

interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerNotes?: string;
  total: number;
  subtotal: number;
  deliveryFee: number;
  tax: number;
  status: string;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
  deliveryInstructions?: string;
  storeId?: string;
}

interface OrderDetailsPageProps {
  params: Promise<{
    orderId: string;
  }>;
}

// Status configurations
const STATUS_CONFIG = {
  pending: {label: "Pending", color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock},
  accepted: {label: "Accepted", color: "bg-blue-100 text-blue-800 border-blue-200", icon: CheckCircle},
  preparing: {label: "Preparing", color: "bg-purple-100 text-purple-800 border-purple-200", icon: Package},
  ready: {label: "Ready", color: "bg-indigo-100 text-indigo-800 border-indigo-200", icon: CheckCircle},
  ready_for_pickup: {label: "Ready for Pickup", color: "bg-indigo-100 text-indigo-800 border-indigo-200", icon: CheckCircle},
  picked_up: {label: "Picked Up", color: "bg-orange-100 text-orange-800 border-orange-200", icon: Truck},
  out_for_delivery: {label: "Out for Delivery", color: "bg-blue-100 text-blue-800 border-blue-200", icon: Truck},
  delivered: {label: "Delivered", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle},
  cancelled: {label: "Cancelled", color: "bg-red-100 text-red-800 border-red-200", icon: XCircle},
};

const STATUS_STEPS = [
  {key: "pending", label: "Pending", icon: Clock},
  {key: "accepted", label: "Accepted", icon: CheckCircle},
  {key: "preparing", label: "Preparing", icon: Package},
  {key: "ready", label: "Ready", icon: Truck},
  {key: "out_for_delivery", label: "Out for Delivery", icon: Truck},
  {key: "delivered", label: "Delivered", icon: CheckCircle},
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

        // Verify user has a store
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

        // Fetch the order
        const orderRef = doc(db, "orders", orderId);
        const orderDoc = await getDoc(orderRef);

        if (!orderDoc.exists()) {
          setError("Order not found");
          setLoading(false);
          return;
        }

        const data = orderDoc.data();

        // Verify this order belongs to the store owner's store
        if (data.storeId !== storeId) {
          setError("You don't have permission to view this order");
          setLoading(false);
          return;
        }

        setOrder({
          id: orderDoc.id,
          customerName: data.customerName || "Customer",
          customerPhone: data.customerPhone || "",
          customerAddress: data.customerAddress || "",
          customerNotes: data.customerNotes || "",
          total: data.total || 0,
          subtotal: data.subtotal || 0,
          deliveryFee: data.deliveryFee || 0,
          tax: data.tax || 0,
          status: data.status || "pending",
          items: data.items || [],
          createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          deliveryInstructions: data.deliveryInstructions || "",
          storeId: data.storeId || "",
        });
      } catch (error) {
        console.error("Error fetching order:", error);
        setError("Failed to load order");
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, router]);

  // Handle status update
  const handleStatusUpdate = async (newStatus: string) => {
    if (!order) return;

    try {
      setUpdating(true);
      await updateDoc(doc(db, "orders", order.id), {
        status: newStatus,
        updatedAt: new Date().toISOString(),
      });
      setOrder({...order, status: newStatus});
    } catch (error) {
      console.error("Error updating order:", error);
      alert("Failed to update order status");
    } finally {
      setUpdating(false);
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }).format(date);
  };

  // Get status config
  const getStatusConfig = (status: string) => {
    return STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Error state
  if (error || !order) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500 text-lg">{error || "Order not found"}</p>
        <Link
          href="/store/store-orders"  // ✅ Correct path for store orders
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
      <div className="flex items-center gap-4">
        <Link
          href="/store/store-orders"  // ✅ Correct path for store orders
          className="p-2 hover:bg-gray-100 rounded-xl transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Order #{order.id.slice(0, 8).toUpperCase()}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${statusConfig.color}`}>
              <StatusIcon className="w-3.5 h-3.5" />
              {statusConfig.label}
            </span>
            <span className="text-sm text-gray-400">
              <Calendar className="w-3.5 h-3.5 inline mr-1" />
              {formatDate(order.createdAt)}
            </span>
          </div>
        </div>
        <button className="ml-auto px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition flex items-center gap-2">
          <Printer className="w-4 h-4" />
          Print
        </button>
      </div>

      {/* Status Timeline */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between">
          {STATUS_STEPS.map((step, index) => {
            const isCompleted = index <= currentStepIndex;
            const Icon = step.icon;

            return (
              <div key={step.key} className="flex-1 flex items-center">
                <div className={`flex flex-col items-center flex-1 ${index > 0 ? "ml-[-8px]" : ""}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    isCompleted ? "bg-green-500" : "bg-gray-200"
                  }`}>
                    <Icon className={`w-5 h-5 ${isCompleted ? "text-white" : "text-gray-400"}`} />
                  </div>
                  <p className={`text-xs font-medium mt-1 ${
                    isCompleted ? "text-gray-800" : "text-gray-400"
                  }`}>
                    {step.label}
                  </p>
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
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Order Details - Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Items */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <Receipt className="w-5 h-5 text-orange-500" />
              <h3 className="font-bold text-gray-800">Order Items</h3>
              <span className="text-xs text-gray-400 ml-auto">{order.items.length} items</span>
            </div>
            <div className="divide-y divide-gray-100">
              {order.items.map((item, index) => (
                <div key={index} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-sm font-medium text-gray-600">
                      {item.quantity}
                    </span>
                    <div>
                      <p className="font-medium text-gray-800">{item.name}</p>
                      <p className="text-sm text-gray-500">${item.price.toFixed(2)} each</p>
                    </div>
                  </div>
                  <p className="font-bold text-gray-800">${item.total.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Customer Notes */}
          {order.customerNotes && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-800 mb-2">Customer Notes</h3>
              <p className="text-gray-600">{order.customerNotes}</p>
            </div>
          )}
        </div>

        {/* Sidebar - Right Column */}
        <div className="space-y-6">
          {/* Customer Info */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-4">Customer</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <User className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">{order.customerName}</span>
              </div>
              {order.customerPhone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">{order.customerPhone}</span>
                </div>
              )}
              {order.customerAddress && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                  <span className="text-gray-600">{order.customerAddress}</span>
                </div>
              )}
            </div>
          </div>

          {/* Payment Summary */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-4">Payment Summary</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="text-gray-800">${order.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Delivery Fee</span>
                <span className="text-gray-800">{order.deliveryFee === 0 ? "Free" : `$${order.deliveryFee.toFixed(2)}`}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tax</span>
                <span className="text-gray-800">${order.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200">
                <span className="text-gray-800">Total</span>
                <span className="text-orange-600">${order.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-4">Actions</h3>
            <div className="space-y-2">
              {order.status === "pending" && (
                <button
                  onClick={() => handleStatusUpdate("accepted")}
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
                  onClick={() => handleStatusUpdate("ready")}
                  disabled={updating}
                  className="w-full px-4 py-3 bg-purple-500 text-white font-semibold rounded-xl hover:bg-purple-600 transition disabled:opacity-50"
                >
                  Mark Ready
                </button>
              )}
              {order.status === "ready" && (
                <button
                  onClick={() => handleStatusUpdate("out_for_delivery")}
                  disabled={updating}
                  className="w-full px-4 py-3 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 transition disabled:opacity-50"
                >
                  Assign Driver
                </button>
              )}
              {order.status === "out_for_delivery" && (
                <button
                  onClick={() => handleStatusUpdate("delivered")}
                  disabled={updating}
                  className="w-full px-4 py-3 bg-green-500 text-white font-semibold rounded-xl hover:bg-green-600 transition disabled:opacity-50"
                >
                  Mark Delivered
                </button>
              )}
              {order.status === "cancelled" && (
                <div className="text-center text-red-500 font-medium">
                  Order Cancelled
                </div>
              )}
              {!["cancelled", "delivered"].includes(order.status) && (
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
          </div>
        </div>
      </div>
    </div>
  );
}
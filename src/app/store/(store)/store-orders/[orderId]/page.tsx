"use client";

import {useState, useEffect} from "react";
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
  AlertCircle
} from "lucide-react";
import {auth, db} from "@/lib/firebase";
import {doc, getDoc, updateDoc} from "firebase/firestore";
import Link from "next/link";

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
}

export default function OrderDetailsPage({params}: {params: {orderId: string}}) {
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const orderDoc = await getDoc(doc(db, "orders", params.orderId));
        if (!orderDoc.exists()) {
          router.push("/store/orders");
          return;
        }

        const data = orderDoc.data();
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
        });
      } catch (error) {
        console.error("Error fetching order:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [params.orderId, router]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">Order not found</p>
      </div>
    );
  }

  const statusSteps = [
    {key: "pending", label: "Pending", icon: Clock},
    {key: "accepted", label: "Accepted", icon: CheckCircle},
    {key: "preparing", label: "Preparing", icon: Package},
    {key: "ready", label: "Ready", icon: Truck},
    {key: "out_for_delivery", label: "Out for Delivery", icon: Truck},
    {key: "delivered", label: "Delivered", icon: CheckCircle},
  ];

  const currentStepIndex = statusSteps.findIndex(s => s.key === order.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/store/orders"
          className="p-2 hover:bg-gray-100 rounded-xl transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Order #{order.id.slice(0, 8).toUpperCase()}
          </h1>
          <p className="text-gray-500 text-sm">
            Placed on {new Date(order.createdAt).toLocaleString()}
          </p>
        </div>
        <button className="ml-auto px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition flex items-center gap-2">
          <Printer className="w-4 h-4" />
          Print
        </button>
      </div>

      {/* Status Timeline */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between">
          {statusSteps.map((step, index) => {
            const isCompleted = index <= currentStepIndex;
            const isCurrent = index === currentStepIndex;
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
                {index < statusSteps.length - 1 && (
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
        {/* Order Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Items */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-gray-800 mb-4">Order Items</h3>
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

            {/* Totals */}
            <div className="border-t border-gray-200 mt-4 pt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="text-gray-800">${order.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Delivery Fee</span>
                <span className="text-gray-800">${order.deliveryFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tax</span>
                <span className="text-gray-800">${order.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200">
                <span>Total</span>
                <span className="text-orange-600">${order.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Customer Notes */}
          {order.customerNotes && (
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="font-bold text-gray-800 mb-2">Customer Notes</h3>
              <p className="text-gray-600">{order.customerNotes}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Customer Info */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
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

          {/* Actions */}
          <div className="bg-white rounded-2xl p-6 shadow-sm">
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
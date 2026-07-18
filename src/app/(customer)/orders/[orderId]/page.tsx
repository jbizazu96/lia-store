"use client";

/*
  Order detail page - Shows full order information with server timestamps.
  ✅ Real-time updates using Firestore onSnapshot
*/

import { mapFirestoreOrder } from "@/mappers/orderMapper";
import type { Order } from "@/types/order";
import {useState, useEffect, use} from "react";
import {useRouter} from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  MapPin,
  Truck,
  Clock,
  Calendar,
  Package,
  CreditCard,
  CheckCircle,
  HandshakeIcon,
  XCircle,
  Store,
  Phone,
  Mail,
  BoxIcon,
  User,
  Receipt,
} from "lucide-react";
import {auth, db} from "@/lib/firebase";
import {doc, onSnapshot} from "firebase/firestore";
import { BrandedLoader } from "@/components/ui/BrandedLoader";


interface OrderPageProps {
  params: Promise<{
    orderId: string;
  }>;
}

// ✅ Complete status steps in order
const STATUS_STEPS = [
  {key: "pending", label: "Pending", icon: Clock, color: "bg-yellow-100 text-yellow-800"},
  {key: "accepted", label: "Accepted", icon: CheckCircle, color: "bg-green-100 text-green-800"},
  {key: "preparing", label: "Preparing", icon: Package, color: "bg-purple-100 text-purple-800"},
  {key: "ready_for_pickup", label: "Ready for Pickup", icon: BoxIcon, color: "bg-indigo-100 text-indigo-800"},
  {key: "out_for_delivery", label: "Out for Delivery", icon: Truck, color: "bg-blue-100 text-blue-800"},
  {key: "completed", label: "Completed", icon: HandshakeIcon, color: "bg-green-100 text-green-800"},
];

// ✅ Status config for individual status display
const STATUS_CONFIG: Record<string, {label: string; color: string; icon: any}> = {
  pending: {label: "Pending", color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock},
  accepted: {label: "Accepted", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle},
  preparing: {label: "Preparing", color: "bg-purple-100 text-purple-800 border-purple-200", icon: Package},
  ready_for_pickup: {label: "Ready for Pickup", color: "bg-indigo-100 text-indigo-800 border-indigo-200", icon: BoxIcon},
  out_for_delivery: {label: "Out for Delivery", color: "bg-blue-100 text-blue-800 border-blue-200", icon: Truck},
  completed: {label: "Completed", color: "bg-green-100 text-green-800 border-green-200", icon: HandshakeIcon},
  cancelled: {label: "Cancelled", color: "bg-red-100 text-red-800 border-red-200", icon: XCircle},
};

export default function OrderDetailPage({params}: OrderPageProps) {
  const {orderId} = use(params);
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // ✅ Check authentication
    const checkAuth = async () => {
      const user = auth.currentUser;
      if (!user) {
        router.push("/login");
        return;
      }
      return user;
    };

    // ✅ Set up real-time listener for the order
    const setupListener = async () => {
      const user = await checkAuth();
      if (!user) return;

      const orderRef = doc(db, "orders", orderId);

      const unsubscribe = onSnapshot(orderRef, (docSnapshot) => {
        if (!docSnapshot.exists()) {
          setError("Order not found");
          setLoading(false);
          return;
        }

        const data = docSnapshot.data();

          // Convert Firestore document into our domain model
          const order = mapFirestoreOrder(docSnapshot);

          // Verify this order belongs to the logged-in customer
          if (order.customer.uid !== user.uid) {
            setError("You don't have permission to view this order.");
            setLoading(false);
            return;
          }

          setOrder(order);

          setLoading(false);
      }, (error) => {
        console.error("Error listening to order:", error);
        setError("Failed to load order");
        setLoading(false);
      });

      // ✅ Cleanup listener on unmount
      return unsubscribe;
    };

    setupListener();
  }, [orderId, router]);


  // Get status config
  const getStatusConfig = (status: string) => {
    return STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  };

  const formatDate = (date: Date | undefined | null) => {
  console.log("formatDate received:", date);

  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).format(date);
};

  // ✅ Get timestamp for a specific status from history
  const getStatusTimestamp = (
  statusKey: string
    ): Date | null => {
      if (!order?.statusHistory) return null;

      const entry = order.statusHistory.find(
        h => h.status === statusKey
      );

      return entry?.timestamp ?? null;
    };

  const formatPrice = (price: number) => {
    const dollars = Math.floor(price);
    const cents = Math.round((price - dollars) * 100);
    return { dollars, cents: cents.toString().padStart(2, '0') };
  };

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
  const currentStepIndex = STATUS_STEPS.findIndex(s => s.key === order.status);
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
              <p className="text-sm font-medium text-gray-700">{formatDate(order.createdAt)}</p>
            </div>
          </div>
        </div>

        {/* ✅ Full Order Timeline with Server Timestamps */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-orange-500" />
            <h3 className="font-semibold text-gray-800">Order Timeline</h3>
          </div>
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-4 top-6 bottom-6 w-0.5 bg-gray-200" />
            
            <div className="space-y-6">
              {STATUS_STEPS.map((step, index) => {
                const completed = iscompleted(index);
                const Icon = step.icon;
                const timestamp = getStatusTimestamp(step.key);
                
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
                          {formatDate(timestamp)}
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
              const price = formatPrice(item.price);
              const totalPrice = formatPrice(item.price * item.quantity);
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

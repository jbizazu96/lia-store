"use client";

/*
  Order detail page - Shows full order information.
*/

import {useState, useEffect, use} from "react";
import {useRouter} from "next/navigation";
import {motion} from "framer-motion";
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
  XCircle,
  Store,
  Phone,
  Mail,
  User,
  Receipt,
} from "lucide-react";
import {auth, db} from "@/lib/firebase";
import {doc, getDoc} from "firebase/firestore";

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
  size?: {
    value: number;
    unit: string;
  };
}

interface OrderDetail {
  id: string;
  userId: string;
  storeId: string;
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  storeEmail?: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  tax: number;
  total: number;
  status: string;
  deliveryAddress: {
    street: string;
    city: string;
    state: string;
    zip: string;
    formattedAddress?: string;
  };
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

interface OrderPageProps {
  params: Promise<{
    orderId: string;
  }>;
}

export default function OrderDetailPage({params}: OrderPageProps) {
  const {orderId} = use(params);
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          router.push("/login");
          return;
        }

        const orderRef = doc(db, "orders", orderId);
        const orderDoc = await getDoc(orderRef);

        if (!orderDoc.exists()) {
          setError("Order not found");
          setLoading(false);
          return;
        }

        const data = orderDoc.data();
        
        // Verify this order belongs to the current user
        if (data.userId !== user.uid) {
          setError("You don't have permission to view this order");
          setLoading(false);
          return;
        }

        setOrder({
          id: orderDoc.id,
          userId: data.userId,
          storeId: data.storeId || "",
          storeName: data.storeName || "Unknown Store",
          storeAddress: data.storeAddress || "",
          storePhone: data.storePhone || "",
          storeEmail: data.storeEmail || "",
          items: data.items || [],
          subtotal: data.subtotal || 0,
          deliveryFee: data.deliveryFee || 0,
          tax: data.tax || 0,
          total: data.total || 0,
          status: data.status || "pending",
          deliveryAddress: data.deliveryAddress || {
            street: "",
            city: "",
            state: "",
            zip: "",
          },
          createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          notes: data.notes || "",
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

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case "delivered": return "bg-green-100 text-green-800 border-green-200";
      case "cancelled": return "bg-red-100 text-red-800 border-red-200";
      case "out_for_delivery": return "bg-blue-100 text-blue-800 border-blue-200";
      case "preparing": return "bg-purple-100 text-purple-800 border-purple-200";
      case "ready_for_pickup": return "bg-indigo-100 text-indigo-800 border-indigo-200";
      case "picked_up": return "bg-orange-100 text-orange-800 border-orange-200";
      case "accepted": return "bg-blue-100 text-blue-800 border-blue-200";
      default: return "bg-yellow-100 text-yellow-800 border-yellow-200";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "delivered": return "Delivered";
      case "cancelled": return "Cancelled";
      case "out_for_delivery": return "Out for Delivery";
      case "preparing": return "Preparing";
      case "ready_for_pickup": return "Ready for Pickup";
      case "picked_up": return "Picked Up";
      case "accepted": return "Accepted";
      default: return "Pending";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "delivered": return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "cancelled": return <XCircle className="w-5 h-5 text-red-500" />;
      default: return <Clock className="w-5 h-5 text-orange-500" />;
    }
  };

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

  const formatPrice = (price: number) => {
    const dollars = Math.floor(price);
    const cents = Math.round((price - dollars) * 100);
    return { dollars, cents: cents.toString().padStart(2, '0') };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
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
              <div className={`px-4 py-2 rounded-xl flex items-center gap-2 ${getStatusColor(order.status)}`}>
                {getStatusIcon(order.status)}
                <span className="font-semibold">{getStatusText(order.status)}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Order Placed</p>
              <p className="text-sm font-medium text-gray-700">{formatDate(order.createdAt)}</p>
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
              <h3 className="font-semibold text-gray-800">{order.storeName}</h3>
              {order.storeAddress && (
                <p className="text-xs text-gray-500">{order.storeAddress}</p>
              )}
            </div>
          </div>
          {(order.storePhone || order.storeEmail) && (
            <div className="flex flex-wrap gap-3 pt-3 border-t border-gray-100">
              {order.storePhone && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Phone className="w-3.5 h-3.5" />
                  <span>{order.storePhone}</span>
                </div>
              )}
              {order.storeEmail && (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Mail className="w-3.5 h-3.5" />
                  <span>{order.storeEmail}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Delivery Address */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-5 h-5 text-orange-500" />
            <h3 className="font-semibold text-gray-800">Delivery Address</h3>
          </div>
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-sm text-gray-800">
              {order.deliveryAddress.street}, {order.deliveryAddress.city}, {order.deliveryAddress.state} {order.deliveryAddress.zip}
            </p>
            {order.deliveryAddress.formattedAddress && (
              <p className="text-xs text-gray-400 mt-0.5">{order.deliveryAddress.formattedAddress}</p>
            )}
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

        {/* Order Notes (if any) */}
        {order.notes && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-2">Order Notes</h3>
            <p className="text-sm text-gray-600">{order.notes}</p>
          </div>
        )}

        {/* Order Timeline */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-orange-500" />
            <h3 className="font-semibold text-gray-800">Order Timeline</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-gray-800 text-sm">Order Placed</p>
                <p className="text-xs text-gray-400">{formatDate(order.createdAt)}</p>
              </div>
            </div>
            {order.status !== "pending" && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Clock className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-800 text-sm">Order {getStatusText(order.status)}</p>
                  <p className="text-xs text-gray-400">{formatDate(order.updatedAt)}</p>
                </div>
              </div>
            )}
            {order.status === "delivered" && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Truck className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-800 text-sm">Delivered</p>
                  <p className="text-xs text-gray-400">{formatDate(order.updatedAt)}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
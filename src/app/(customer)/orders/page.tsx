"use client";

import { mapFirestoreOrder } from "@/mappers/orderMapper";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { auth, db } from "@/lib/firebase";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  Package,
  Clock,
  CheckCircle,
  XCircle,
  Truck,
  ArrowLeft,
  ShoppingBag,
  HandshakeIcon,
  Calendar,
  CreditCard,
  MapPin,
  BoxIcon,
} from "lucide-react";
import Link from "next/link";
import {
  getFunctions,
  httpsCallable,
} from "firebase/functions";
import type { Order } from "@/types/order";

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const functions = getFunctions();

const syncCustomerOrders = httpsCallable(
  functions,
  "syncCustomerOrders"
);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      // ----------------------------------------------------
      // Synchronize this customer's active deliveries.
      // ----------------------------------------------------
      try {

        await syncCustomerOrders();

        console.log(
          "Customer orders synchronized."
        );

      } catch (error) {

        console.error(
          "Synchronization failed:",
          error
        );

      }
      // ✅ Set up real-time listener for orders
      const ordersRef = collection(db, "orders");
      const q = query(
        ordersRef,
        where("customer.uid", "==", user.uid),
        orderBy("createdAt", "desc")
      );

      // ✅ Listen for real-time updates
      const unsubscribeOrders = onSnapshot(q, (snapshot) => {
        const ordersData = snapshot.docs.map(mapFirestoreOrder);

        setOrders(ordersData);
        setLoading(false);
      }, (error) => {
        console.error("Error listening to orders:", error);
        setLoading(false);
      });

      // ✅ Cleanup listener on unmount
      return () => unsubscribeOrders();
    });

    return () => unsubscribeAuth();
  }, [router]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Completed":
        return <HandshakeIcon className="w-5 h-5 text-green-500" />;
      case "cancelled":
        return <XCircle className="w-5 h-5 text-red-500" />;
      case "out_for_delivery":
        return <Truck className="w-5 h-5 text-blue-500" />;
      case "preparing":
        return <Package className="w-5 h-5 text-purple-500" />;
      case "accepted":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "ready_for_pickup":
        return <BoxIcon className="w-5 h-5 text-indigo-500" />;
      default:
        return <Clock className="w-5 h-5 text-orange-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "completed": return "Completed";
      case "cancelled": return "Cancelled";
      case "out_for_delivery": return "Out for Delivery";
      case "preparing": return "Preparing";
      case "accepted": return "Accepted";
      case "ready_for_pickup": return "Ready for Pickup";
      default: return "Pending";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-green-100 text-green-800";
      case "cancelled": return "bg-red-100 text-red-800";
      case "out_for_delivery": return "bg-blue-100 text-blue-800";
      case "preparing": return "bg-purple-100 text-purple-800";
      case "accepted": return "bg-green-100 text-green-800";
      case "ready_for_pickup": return "bg-indigo-100 text-indigo-800";
      default: return "bg-yellow-100 text-yellow-800";
    }
  };

  const formatDate = (date: Date) => {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
    };

    const formatTime = (date: Date) => {
      return new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "numeric",
      }).format(date);
    };

  // ✅ Helper function to format address object to string
  const formatAddress = (address: any) => {
    if (!address) return "";
    if (typeof address === 'string') return address;
    return `${address.street || ""}, ${address.city || ""}, ${address.state || ""} ${address.zip || ""}`;
  };

  /* ==========================================
     BRANDED LOADING SCREEN - WHITE THEME
  ========================================== */
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col justify-center items-center relative overflow-hidden">
        
        {/* Ambient Glows (Soft Yellow accents on white background) */}
        <div className="absolute top-0 right-0 h-[500px] w-[500px] rounded-full bg-yellow-400/5 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 h-[400px] w-[400px] rounded-full bg-blue-500/5 blur-[100px] pointer-events-none" />

        {/* Centered Loader */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center justify-center p-8 relative z-10"
        >
          
          {/* Logo Orbiting Container */}
          <div className="relative w-28 h-28 mb-8 flex items-center justify-center">
            
            {/* Dotted Orbit Ring */}
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 rounded-full border-2 border-dashed border-yellow-400/30"
            />
            
            {/* Inner Ring */}
            <motion.div 
              animate={{ rotate: -360 }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="absolute inset-2 rounded-full border border-yellow-400/10"
            />
            
            {/* Rotating glowing dots */}
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0"
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.8)]" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 rounded-full bg-yellow-400/40" />
              <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-yellow-400/40" />
              <div className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-yellow-400/40" />
            </motion.div>

            {/* Central Logo Image */}
            <div className="relative w-16 h-16 z-10 bg-white/80 backdrop-blur-md rounded-full border-2 border-yellow-400/50 shadow-[0_0_30px_rgba(234,179,8,0.15)] flex items-center justify-center overflow-hidden">
              <img 
                src="/icon/icon-192.png" 
                alt="LIA Logo" 
                className="w-12 h-12 object-contain" 
              />
            </div>
          </div>

          {/* Loading Text */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="text-center"
          >
            <h3 className="text-lg font-medium text-gray-600 mb-1 tracking-wide opacity-100">
              Loading orders
            </h3>
            <div className="flex items-center justify-center gap-1 mt-2">
              
              {/* Dot 1 */}
              <motion.span 
                initial={{ opacity: 0.5 }} 
                animate={{ opacity: [0.5, 1, 0.5] }} 
                transition={{ duration: 1.5, repeat: Infinity, delay: 0 }} 
                className="w-1.5 h-1.5 rounded-full bg-yellow-400"
              />
              
              {/* Dot 2 */}
              <motion.span 
                initial={{ opacity: 0.5 }} 
                animate={{ opacity: [0.5, 1, 0.5] }} 
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }} 
                className="w-1.5 h-1.5 rounded-full bg-yellow-400"
              />
              
              {/* Dot 3 */}
              <motion.span 
                initial={{ opacity: 0.5 }} 
                animate={{ opacity: [0.5, 1, 0.5] }} 
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.6 }} 
                className="w-1.5 h-1.5 rounded-full bg-yellow-400"
              />
            </div>
          </motion.div>
          
        </motion.div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header with Back Button */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="flex items-center gap-3 px-4 py-4 max-w-lg mx-auto">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-full transition"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-xl font-bold text-gray-800">My Orders</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        {orders.length === 0 ? (
          // Beautiful Empty State
          <motion.div
            initial={{opacity: 0, y: 20}}
            animate={{opacity: 1, y: 0}}
            className="text-center py-16"
          >
            {/* Empty State Illustration */}
            <div className="relative w-48 h-48 mx-auto mb-8">
              <div className="absolute inset-0 bg-orange-100 rounded-full opacity-20 scale-150" />
              <div className="relative w-full h-full flex items-center justify-center">
                <Package className="w-24 h-24 text-orange-300" />
                <motion.div
                  animate={{
                    y: [0, -10, 0],
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 2,
                    ease: "easeInOut",
                  }}
                  className="absolute -top-2 -right-2 w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center"
                >
                  <span className="text-2xl">📦</span>
                </motion.div>
              </div>
            </div>

            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              No orders yet
            </h2>
            <p className="text-gray-500 text-sm mb-6 max-w-xs mx-auto">
              Start shopping and your orders will appear here. 
              Fresh African groceries Completed to your door!
            </p>

            <Link
              href="/home"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold rounded-xl hover:shadow-lg hover:from-orange-600 hover:to-orange-700 transition"
            >
              <ShoppingBag className="w-5 h-5" />
              Browse Stores
            </Link>

            <div className="mt-8 flex flex-col gap-3 text-sm text-gray-400">
              <div className="flex items-center justify-center gap-2">
                <Truck className="w-4 h-4" />
                <span>Fast delivery in 30-45 min</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <MapPin className="w-4 h-4" />
                <span>Track your order in real-time</span>
              </div>
            </div>
          </motion.div>
        ) : (
          // Orders List
          <div className="space-y-4">
            <p className="text-sm text-gray-400 px-1">
              {orders.length} order{orders.length !== 1 ? 's' : ''}
            </p>
            
            <AnimatePresence mode="popLayout">
              {orders.map((order, index) => (
                <motion.div
                  key={order.id}
                  initial={{opacity: 0, y: 20}}
                  animate={{opacity: 1, y: 0}}
                  exit={{opacity: 0, x: -20}}
                  transition={{delay: index * 0.05}}
                  className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition border border-gray-100"
                >
                  {/* Order Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-800 truncate">
                        {order.store.name || "Unknown Store"    }
                      </h3>
                      <div className="flex items-center gap-3 mt-1">
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{formatDate(order.createdAt)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{formatTime(order.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${getStatusColor(order.status)}`}>
                      {getStatusIcon(order.status)}
                      {getStatusText(order.status)}
                    </div>
                  </div>

                  {/* Order Details */}
                  <div className="flex flex-col gap-2 pt-3 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>{order.items.length} item{order.items.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-gray-800">
                          ${order.pricing.total.toFixed(2)}
                        </span>
                        <Link
                          href={`/orders/${order.id}`}
                          className="px-3 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-50 rounded-lg transition"
                        >
                          View Details
                        </Link>
                      </div>
                    </div>
                    
                    {/* ✅ Delivery Address - Properly formatted from object */}
                    {order.customer.address && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-1">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">
                          {formatAddress(order.customer.address)}
                        </span>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </main>
  );
}
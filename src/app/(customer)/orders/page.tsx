"use client";

import {
  ORDER_STATUS_CONFIG,
} from "@/config/orderStatus";

import {
  formatOrderDateOnly,
  formatOrderTime,
  displayOrderNumber,
} from "@/utils/orderDisplay";
import { useCustomerOrderHistory } from "@/hooks/useCustomerOrderHistory";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Package,
  Clock,
  Truck,
  ShoppingBag,
  Calendar,
  ChevronRight,
  MapPin,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { CustomerBottomNavigation } from "@/components/customer/navigation/CustomerBottomNavigation";
import { CustomerPageState } from "@/components/customer/ui/CustomerPageState";

export default function OrdersPage() {
  const router = useRouter();
      const {
      orders,
      loading,
      loadingMore,
      hasMore,
      loadMore,
      error,
      isAuthenticated,
    } = useCustomerOrderHistory();

  if (!loading && !isAuthenticated) {
      router.push("/login");
      return null;
    }

  /* ==========================================
     BRANDED LOADING SCREEN - WHITE THEME
  ========================================== */
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center relative overflow-hidden">
        
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
              className="absolute inset-0 rounded-full border-2 border-dashed border-orange-400/30"
            />
            
            {/* Inner Ring */}
            <motion.div 
              animate={{ rotate: -360 }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              className="absolute inset-2 rounded-full border border-orange-400/10"
            />
            
            {/* Rotating glowing dots */}
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0"
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-orange-400 shadow-[0_0_15px_rgba(251,146,60,0.8)]" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-2 h-2 rounded-full bg-orange-400/40" />
              <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-orange-400/40" />
              <div className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-orange-400/40" />
            </motion.div>

            {/* Central Logo Image */}
            <div className="relative w-16 h-16 z-10 bg-white/80 backdrop-blur-md rounded-full border-2 border-orange-400/50 shadow-[0_0_30px_rgba(251,146,60,0.15)] flex items-center justify-center overflow-hidden">
              <Image
                src="/icon/icon-192.png" 
                alt="LIA Logo" 
                width={48}
                height={48}
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
                className="w-1.5 h-1.5 rounded-full bg-orange-400"
              />
              
              {/* Dot 2 */}
              <motion.span 
                initial={{ opacity: 0.5 }} 
                animate={{ opacity: [0.5, 1, 0.5] }} 
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }} 
                className="w-1.5 h-1.5 rounded-full bg-orange-400"
              />
              
              {/* Dot 3 */}
              <motion.span 
                initial={{ opacity: 0.5 }} 
                animate={{ opacity: [0.5, 1, 0.5] }} 
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.6 }} 
                className="w-1.5 h-1.5 rounded-full bg-orange-400"
              />
            </div>
          </motion.div>
          
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-white">
        <CustomerPageState
          kind="error"
          title="We couldn’t load your orders"
          description={error}
          action={{
            label: "Try again",
            onClick: () => window.location.reload(),
          }}
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white pb-28">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className="relative flex items-center justify-center px-4 py-4 max-w-2xl mx-auto">
          <h1 className="pointer-events-none absolute inset-x-0 text-center text-xl font-extrabold tracking-tight text-gray-900">Orders</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5">
        <section className="relative mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-orange-50 via-amber-50 to-white px-4 py-3.5 shadow-[0_10px_28px_rgba(249,115,22,0.07)]">
          <div className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full bg-orange-200/35" />
          <div className="relative flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white shadow-sm">
              <Package className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-extrabold text-gray-900">Your orders</h2>
              <p className="mt-0.5 text-xs font-medium text-gray-500">
                Track deliveries and review previous purchases.
              </p>
            </div>
            <span className="relative rounded-full bg-white/85 px-2.5 py-1 text-xs font-extrabold text-orange-700 shadow-sm">
              {orders.length}
            </span>
          </div>
        </section>

        {orders.length === 0 ? (
          // Beautiful Empty State
          <div className="text-center py-16">
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
          </div>
        ) : (
          // Orders List
          <div className="space-y-3">
              {orders.map((order) => {
                const statusConfig =
                  order.status in ORDER_STATUS_CONFIG
                    ? ORDER_STATUS_CONFIG[
                        order.status as keyof typeof ORDER_STATUS_CONFIG
                      ]
                    : ORDER_STATUS_CONFIG.pending;

                const StatusIcon = statusConfig.icon;

                return (
                <div
                  key={order.id}
                  role="link"
                  tabIndex={0}
                  aria-label={`View details for order ${order.orderNumber || "Unavailable"}`}
                  onClick={() => router.push(`/orders/${order.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/orders/${order.id}`);
                    }
                  }}
                  className="group cursor-pointer rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_6px_18px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-[0_10px_24px_rgba(15,23,42,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
                >
                  {/* Order Header */}
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-600">
                        {displayOrderNumber(order.orderNumber)}
                      </p>
                      <h3 className="mt-1 font-extrabold text-gray-900 truncate">
                        {order.store.name || "Unknown Store"}
                      </h3>
                      <div className="flex items-center gap-3 mt-1">
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{formatOrderDateOnly(order.createdAt)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{formatOrderTime(order.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                      <div
                        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${statusConfig.color}`}
                      >
                        <StatusIcon className="h-5 w-5" />

                        {statusConfig.label}
                      </div>
                  </div>

                  {/* Order Details */}
                  <div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>{order.items.length} item{order.items.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-extrabold text-gray-900">
                          ${order.pricing.total.toFixed(2)}
                        </span>
                        <Link
                          href={`/orders/${order.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex items-center gap-1 rounded-xl bg-orange-50 px-3 py-2 text-xs font-bold text-orange-700 transition hover:bg-orange-100"
                        >
                          Details <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                        </Link>
                      </div>
                    </div>
                    
                    {/* ✅ Delivery Address - Properly formatted from object */}
                    {order.customer.address && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-1">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">
                          {order.customer.address}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
               );
              })}
            {hasMore && (
              <div className="pt-3 text-center">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="rounded-full border border-orange-200 bg-orange-50 px-5 py-2.5 text-sm font-bold text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingMore ? "Loading more orders…" : "Load more orders"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <CustomerBottomNavigation />
    </main>
  );
}

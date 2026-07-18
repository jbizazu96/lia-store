"use client";

import { useNotifications } from "@/context/NotificationContext";
import { notificationService } from "@/services/notification/notificationService";
import {useState, useEffect} from "react";
import Link from "next/link";
import {User, Bell, ShoppingCart, Package} from "lucide-react";
import Image from "next/image";
import {useCart} from "@/context/CartContext";
import {auth, db} from "@/lib/firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import {onAuthStateChanged} from "firebase/auth";
import { useRouter } from "next/navigation";

interface TopNavigationProps {
  userName: string;
  showSearch?: boolean;
}

// ✅ Order status colors
const orderStatusColors: Record<string, string> = {
  pending: "bg-yellow-500",
  accepted: "bg-blue-500",
  preparing: "bg-purple-500",
  ready_for_pickup: "bg-indigo-500",
  picked_up: "bg-orange-500",
  out_for_delivery: "bg-blue-500",
  completed: "bg-green-500",
  cancelled: "bg-red-500",
};

// ✅ Order status labels
const orderStatusLabels: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  preparing: "Preparing",
  ready_for_pickup: "Ready for Pickup",
  picked_up: "Picked Up",
  out_for_delivery: "Out for Delivery",
  completed: "completed",
  cancelled: "Cancelled",
};

export function TopNavigation({userName, showSearch = false}: TopNavigationProps) {
  const {itemCount} = useCart();
  const [orderCount, setOrderCount] = useState(0);
  const [latestOrderStatus, setLatestOrderStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { unreadCount } = useNotifications();
  const router = useRouter();

  // ✅ Fetch active orders (not completed or cancelled)
  useEffect(() => {
  const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    if (!user) {
      setOrderCount(0);
      setLatestOrderStatus(null);
      setLoading(false);
      return;
    }

    const ordersRef = collection(db, "orders");

    const q = query(
      ordersRef,
      where("customer.uid", "==", user.uid)
    );

    const unsubscribeOrders = onSnapshot(q, (snapshot) => {
      let activeOrders = 0;
      let latestStatus: string | null = null;
      let latestDate = new Date(0);

      snapshot.forEach((doc) => {
        const data = doc.data();

        const status = data.status ?? "pending";

        if (status !== "completed" && status !== "cancelled") {
          activeOrders++;

          const createdAt =
            data.createdAt?.toDate?.() ?? new Date(0);

          if (createdAt > latestDate) {
            latestDate = createdAt;
            latestStatus = status;
          }
        }
      });


      setOrderCount(activeOrders);
      setLatestOrderStatus(latestStatus);
      setLoading(false);
    });

    // Cleanup Firestore listener when auth changes
    return unsubscribeOrders;
  });

  // Cleanup auth listener when component unmounts
  return () => unsubscribeAuth();
}, []);

  // ✅ Get color for the order status dot
  const getStatusColor = (status: string | null) => {
    if (!status) return "bg-gray-400";
    return orderStatusColors[status] || "bg-gray-400";
  };

  // ✅ Get status label
  const getStatusLabel = (status: string | null) => {
    if (!status) return "";
    return orderStatusLabels[status] || status;
  };

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/home" className="flex items-center gap-2">
            <div className="relative w-8 h-8">
              <Image
                src="/icon/icon-192.png"
                alt=" LIA Logo"
                fill
                className="w-12 h-12 object-contain"
              />
            </div>
            <span className="text-lg font-bold text-green-800"></span>
          </Link>

          {/* Right: Icons with gray backgrounds */}
          <div className="flex items-center gap-1">
            {/* Orders - With Count Badge */}
            <Link 
              href="/orders" 
              className="relative w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition"
              aria-label="My Orders"
            >
              <Package className="w-5 h-5 text-gray-600" />
              
              {/* ✅ Order count badge - shows number of active orders */}
              {orderCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {orderCount > 99 ? "99+" : orderCount}
                </span>
              )}
              
              {/* ✅ Status dot - shows latest order status */}
              {latestOrderStatus && orderCount > 0 && (
                <span 
                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${getStatusColor(latestOrderStatus)}`}
                  title={`Latest order: ${getStatusLabel(latestOrderStatus)}`}
                />
              )}
            </Link>

            {/* Notifications */}
            <button
              onClick={() => router.push("/notifications")}
              className="relative w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5 text-gray-600" />

              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {unreadCount > 99
                    ? "99+"
                    : unreadCount}
                </span>
              )}
            </button>

            {/* Profile */}
            <Link 
              href="/profile" 
              className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition"
              aria-label="Profile"
            >
              <User className="w-5 h-5 text-gray-600" />
            </Link>

            {/* Cart */}
            <Link 
              href="/cart" 
              className="relative w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition"
              aria-label="Cart"
            >
              <ShoppingCart className="w-5 h-5 text-gray-600" />
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-4 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
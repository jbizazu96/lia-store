"use client";

import {useState, useEffect} from "react";
import Link from "next/link";
import {User, Bell, ShoppingCart, Package} from "lucide-react";
import Image from "next/image";
import {useCart} from "@/context/CartContext";
import {auth, db} from "@/lib/firebase";
import {collection, query, where, getDocs} from "firebase/firestore";
import {onAuthStateChanged} from "firebase/auth";

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
  delivered: "bg-green-500",
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
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function TopNavigation({userName, showSearch = false}: TopNavigationProps) {
  const {itemCount} = useCart();
  const [orderCount, setOrderCount] = useState(0);
  const [latestOrderStatus, setLatestOrderStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ✅ Fetch active orders (not delivered or cancelled)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Query orders for this user
          const ordersRef = collection(db, "orders");
          const q = query(ordersRef, where("userId", "==", user.uid));
          const snapshot = await getDocs(q);
          
          let activeOrders = 0;
          let latestStatus = null;
          let latestDate = new Date(0);

          snapshot.forEach((doc) => {
            const data = doc.data();
            const status = data.status || "pending";
            
            // ✅ Count active orders (not delivered, not cancelled)
            if (status !== "delivered" && status !== "cancelled") {
              activeOrders++;
              
              // ✅ Track latest order status
              const createdAt = data.createdAt?.toDate?.() || new Date(0);
              if (createdAt > latestDate) {
                latestDate = createdAt;
                latestStatus = status;
              }
            }
          });
          
          setOrderCount(activeOrders);
          setLatestOrderStatus(latestStatus);
        } catch (error) {
          console.error("Error fetching orders:", error);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
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
                <span className="absolute -top-1 -right-1 min-w-[18px] h-4 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
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
              className="relative w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5 text-gray-600" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full" />
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
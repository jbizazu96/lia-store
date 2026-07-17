/*
|--------------------------------------------------------------------------
| Store layout
|--------------------------------------------------------------------------
|
|
*/
"use client";

import { useNotifications } from "@/context/NotificationContext";
import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  DollarSign,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Store,
  Bell,
  Clock,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import Image from "next/image";
import Link from "next/link";

interface StoreData {
  id: string;
  name: string;
  logoUrl?: string;
  status: string;
}

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [storeData, setStoreData] = useState<StoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const { unreadCount } = useNotifications();
  
  // ✅ State for pending orders count
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);

  // ✅ Check if device is mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // ✅ Close sidebar when clicking outside on mobile only
  useEffect(() => {
    if (!isMobile) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (sidebarOpen && sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (target.closest('button') && target.closest('button')?.querySelector('.menu-button')) {
          return;
        }
        setSidebarOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [sidebarOpen, isMobile]);

  // ✅ Close sidebar on route change (mobile only)
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [pathname, isMobile]);

  // ✅ For desktop, keep sidebar open by default
  useEffect(() => {
    if (!isMobile) {
      setSidebarOpen(true);
    }
  }, [isMobile]);

  // ✅ Fetch pending orders count
  useEffect(() => {
    const fetchPendingOrders = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;

        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);
        let storeId = userDoc.data()?.storeId;

        if (!storeId) {
          const storesRef = collection(db, "stores");
          const q = query(storesRef, where("ownerId", "==", user.uid));
          const storeSnapshot = await getDocs(q);
          if (!storeSnapshot.empty) {
            storeId = storeSnapshot.docs[0].id;
          }
        }

        if (!storeId) return;

        const ordersRef = collection(db, "orders");
        const q = query(
          ordersRef,
          where("store.id", "==", storeId),
          where("status", "in", ["pending", "accepted", "preparing", "ready_for_pickup"])
        );
        const snapshot = await getDocs(q);
        setPendingOrdersCount(snapshot.size);
        
      } catch (error) {
        console.error("Error fetching pending orders:", error);
      }
    };

    fetchPendingOrders();

    const interval = setInterval(fetchPendingOrders, 30000);
    return () => clearInterval(interval);
  }, []);

  // Navigation items with dynamic badge
  const navItems = [
    { name: "Dashboard", icon: LayoutDashboard, href: "/store/dashboard" },
    { name: "Orders", icon: ShoppingBag, href: "/store/store-orders", badge: pendingOrdersCount > 0 ? pendingOrdersCount.toString() : undefined },
    { name: "Products", icon: Package, href: "/store/products" },
    { name: "Earnings", icon: DollarSign, href: "/store/earnings" },
    { name: "Settings", icon: Settings, href: "/store/settings" },
  ];

  // Check auth and get store data
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      try {
        const storesRef = collection(db, "stores");
        const q = query(storesRef, where("ownerId", "==", user.uid));
        const storeSnapshot = await getDocs(q);
        
        if (storeSnapshot.empty) {
          router.push("/store/create");
          return;
        }

        const storeDoc = storeSnapshot.docs[0];
        const data = storeDoc.data();

        if (data.status !== "active") {
          router.push("/store/create");
          return;
        }

        setStoreData({
          id: storeDoc.id,
          name: data.name,
          logoUrl: data.logoUrl,
          status: data.status,
        });
      } catch (error) {
        console.error("Error fetching store:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Handle logout
  const handleLogout = async () => {
    await auth.signOut();
    router.push("/login");
  };

  // ✅ Close sidebar helper (mobile only)
  const closeSidebar = () => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  // ✅ Toggle sidebar (different behavior for mobile vs desktop)
  const toggleSidebar = () => {
    if (isMobile) {
      setSidebarOpen(!sidebarOpen);
    }
    // On desktop, we keep it always open, so toggle does nothing
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* ✅ Overlay for mobile only */}
      <AnimatePresence>
        {isMobile && sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={closeSidebar}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        ref={sidebarRef}
        initial={{ x: isMobile ? -280 : 0 }}
        animate={{ 
          x: isMobile ? (sidebarOpen ? 0 : -280) : 0 
        }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className="fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-200 z-50 overflow-y-auto shadow-xl"
      >
        {/* Store Info */}
        <div className="p-4 border-b border-gray-200">
          <Link 
            href="/store/dashboard" 
            className="flex items-center gap-3"
            onClick={closeSidebar}
          >
            <div className="relative w-10 h-10 rounded-lg overflow-hidden">
              {storeData?.logoUrl ? (
                <Image
                  src={storeData.logoUrl}
                  alt={storeData.name}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
                  <Store className="w-5 h-5 text-white" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-800 truncate">
                {storeData?.name || "My Store"}
              </p>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs text-gray-500">Active</span>
              </div>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
            const showBadge = item.badge && parseInt(item.badge) > 0;
            
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={closeSidebar}
                className={`flex items-center justify-between px-4 py-3 rounded-xl transition ${
                  isActive
                    ? "bg-orange-50 text-orange-600"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon className={`w-5 h-5 ${
                    isActive ? "text-orange-600" : "text-gray-400"
                  }`} />
                  <span className="font-medium text-sm">{item.name}</span>
                </div>
                {showBadge && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    isActive
                      ? "bg-orange-200 text-orange-700"
                      : "bg-orange-500 text-white"
                  }`}>
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}

          <div className="border-t border-gray-200 my-4" />

          <button
            onClick={() => {
              handleLogout();
              closeSidebar();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-xl transition"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium text-sm">Logout</span>
          </button>
        </nav>
      </motion.aside>

      {/* Main Content */}
      <div className={`flex-1 transition-all duration-300 ${isMobile ? '' : 'ml-64'}`}>
        {/* Top Bar */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="flex items-center justify-between px-4 sm:px-6 py-4">
            <div className="flex items-center gap-4">
              {/* ✅ Menu button - only shows on mobile */}
              {isMobile && (
                <button
                  onClick={toggleSidebar}
                  className="p-2 hover:bg-gray-100 rounded-lg transition"
                  aria-label="Toggle sidebar"
                >
                  <Menu className="w-5 h-5 text-gray-700" />
                </button>
              )}
              <h1 className="text-xl font-bold text-gray-800 hidden sm:block">
                {navItems.find(item => pathname === item.href || pathname?.startsWith(item.href + "/"))?.name || "Dashboard"}
              </h1>
            </div>

            <div className="flex items-center gap-4">
              {/* Quick Stats */}
              <div className="hidden md:flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">Pending Orders: {pendingOrdersCount}</span>
                </div>
              </div>

              {/* Notifications */}
              <button
                  onClick={() => router.push("/store/notifications")}
                  className="relative p-2 hover:bg-gray-100 rounded-lg transition"
                  aria-label="Notifications"
                >
                <Bell className="w-5 h-5 text-gray-600" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 99
                      ? "99+"
                      : unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-4 sm:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
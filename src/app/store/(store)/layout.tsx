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
  ChevronRight,
  CheckCircle,
} from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import Image from "next/image";
import Link from "next/link";
import { notificationService } from "@/services/notification/notificationService";
import type { Notification } from "@/services/notification/notificationTypes";

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
  
  // ✅ Notification dropdown state
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState<Notification[]>([]);
  const notificationRef = useRef<HTMLDivElement>(null);
  
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

  // ✅ Close notification dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showNotifications && notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotifications]);

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

  // ✅ Fetch ONLY unread notifications for dropdown
  useEffect(() => {
    if (!auth.currentUser) return;

    const unsubscribe = notificationService.listenForNotifications(
      auth.currentUser.uid,
      (notifications) => {
        // ✅ Filter ONLY unread notifications
        const unread = notifications.filter(n => !n.read);
        // Sort by date (newest first) and take the 4 most recent
        const sorted = unread.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        setUnreadNotifications(sorted.slice(0, 4));
      }
    );

    return unsubscribe;
  }, []);

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
  };

  // ✅ Toggle notification dropdown
  const toggleNotifications = () => {
    setShowNotifications(!showNotifications);
  };

  // ✅ Handle notification click - marks as read and removes from dropdown
  const handleNotificationClick = async (notification: Notification) => {
    const user = auth.currentUser;
    if (!user) return;
    
    if (!notification.read) {
      await notificationService.markAsRead(user.uid, notification.id);
      // ✅ Remove from unread list immediately
      setUnreadNotifications(prev => prev.filter(n => n.id !== notification.id));
    }
    
    setShowNotifications(false);
    if (notification.deepLink) {
      router.push(notification.deepLink);
    }
  };

  // ✅ Mark all as read
  const handleMarkAllAsRead = async () => {
    const user = auth.currentUser;
    if (!user || unreadNotifications.length === 0) return;

    for (const notification of unreadNotifications) {
      await notificationService.markAsRead(user.uid, notification.id);
    }
    // ✅ Clear all unread from dropdown
    setUnreadNotifications([]);
    setShowNotifications(false);
  };

  // ✅ Format time
  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  // ✅ Branded Loading Screen with Logo and Orbit
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
              Loading your store
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

              {/* Notifications Dropdown */}
              <div className="relative" ref={notificationRef}>
                <button
                  onClick={toggleNotifications}
                  className="relative p-2 hover:bg-gray-100 rounded-lg transition"
                  aria-label="Notifications"
                >
                  <Bell className="w-5 h-5 text-gray-600" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </button>

                {/* Notification Dropdown - ONLY SHOWS UNREAD */}
                <AnimatePresence>
                  {showNotifications && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden z-50"
                    >
                      {/* Dropdown Header */}
                      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                        <h3 className="font-semibold text-gray-800 text-sm">Unread Notifications</h3>
                        <div className="flex items-center gap-2">
                          {unreadNotifications.length > 0 && (
                            <button
                              onClick={handleMarkAllAsRead}
                              className="text-xs text-orange-600 hover:text-orange-700 font-medium transition"
                            >
                              Mark all read
                            </button>
                          )}
                          <span className="text-xs text-gray-400">
                            {unreadNotifications.length}
                          </span>
                        </div>
                      </div>

                      {/* Notification List - Only Unread */}
                      <div className="max-h-96 overflow-y-auto">
                        {unreadNotifications.length === 0 ? (
                          <div className="p-8 text-center">
                            <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
                              <CheckCircle className="w-6 h-6 text-green-500" />
                            </div>
                            <p className="text-sm font-medium text-gray-600">All caught up!</p>
                            <p className="text-xs text-gray-400 mt-1">No unread notifications</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-gray-100">
                            {unreadNotifications.map((notification) => (
                              <button
                                key={notification.id}
                                onClick={() => handleNotificationClick(notification)}
                                className="w-full text-left px-4 py-3 hover:bg-orange-50/70 transition bg-orange-50/30"
                              >
                                <div className="flex items-start gap-3">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-800">
                                      {notification.title}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate mt-0.5">
                                      {notification.body}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1">
                                      {formatTime(notification.createdAt)}
                                    </p>
                                  </div>
                                  <div className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0 mt-1.5" />
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* View All Link */}
                      <div className="border-t border-gray-100 p-2">
                        <button
                          onClick={() => {
                            setShowNotifications(false);
                            router.push("/store/notifications");
                          }}
                          className="w-full flex items-center justify-center gap-1 py-2 text-sm font-medium text-orange-600 hover:bg-orange-50 rounded-xl transition"
                        >
                          View all notifications
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
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
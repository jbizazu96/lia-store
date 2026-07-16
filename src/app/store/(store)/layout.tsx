"use client";

import {useState, useEffect} from "react";
import {useRouter, usePathname} from "next/navigation";
import {motion} from "framer-motion";
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
import {auth, db} from "@/lib/firebase";
import {collection, query, where, getDocs, doc, getDoc} from "firebase/firestore";
import {onAuthStateChanged} from "firebase/auth";
import Image from "next/image";
import Link from "next/link";

interface StoreData {
  id: string;
  name: string;
  logoUrl?: string;
  status: string;
}

export default function StoreLayout({children}: {children: React.ReactNode}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [storeData, setStoreData] = useState<StoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState(3);
  
  // ✅ State for pending orders count
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);

  // ✅ Fetch pending orders count
  useEffect(() => {
    const fetchPendingOrders = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;

        // Get store ID
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

        // ✅ Count pending orders (not delivered or cancelled)
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

    // ✅ Refresh count every 30 seconds
    const interval = setInterval(fetchPendingOrders, 30000);
    return () => clearInterval(interval);
  }, []);

  // Navigation items with dynamic badge
  const navItems = [
    {name: "Dashboard", icon: LayoutDashboard, href: "/store/dashboard"},
    {name: "Orders", icon: ShoppingBag, href: "/store/store-orders", badge: pendingOrdersCount > 0 ? pendingOrdersCount.toString() : undefined},
    {name: "Products", icon: Package, href: "/store/products"},
    {name: "Earnings", icon: DollarSign, href: "/store/earnings"},
    //{name: "Analytics", icon: BarChart3, href: "/store/analytics"},
    {name: "Settings", icon: Settings, href: "/store/settings"},
  ];

  // Check auth and get store data
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      try {
        // Get store by ownerId
        const storesRef = collection(db, "stores");
        const q = query(storesRef, where("ownerId", "==", user.uid));
        const storeSnapshot = await getDocs(q);
        
        if (storeSnapshot.empty) {
          router.push("/store/create");
          return;
        }

        const storeDoc = storeSnapshot.docs[0];
        const data = storeDoc.data();

        // Check if store is active
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <motion.aside
        initial={{x: -280}}
        animate={{x: sidebarOpen ? 0 : -280}}
        transition={{duration: 0.3}}
        className="fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-200 z-50 overflow-y-auto"
      >
        {/* Store Info */}
        <div className="p-4 border-b border-gray-200">
          <Link href="/store/dashboard" className="flex items-center gap-3">
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
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-xl transition"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium text-sm">Logout</span>
          </button>
        </nav>
      </motion.aside>

      {/* Main Content */}
      <div className={`flex-1 ${sidebarOpen ? "ml-64" : "ml-0"} transition-all duration-300`}>
        {/* Top Bar */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
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
              <button className="relative p-2 hover:bg-gray-100 rounded-lg transition">
                <Bell className="w-5 h-5 text-gray-600" />
                {notifications > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {notifications}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
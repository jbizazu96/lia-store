"use client";

/*
  This is the main dashboard page.
  It will load the dashboard content with the sidebar layout.
  The layout.tsx in (store) folder provides the sidebar and header.
*/

import {useState, useEffect} from "react";
import {useRouter} from "next/navigation";
import {motion} from "framer-motion";
import {
  TrendingUp,
  ShoppingBag,
  DollarSign,
  Users,
  Star,
  Clock,
  Package,
  ArrowRight,
  AlertCircle,
  CheckCircle,
  BarChart3
} from "lucide-react";
import {auth, db} from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  doc,
  getDoc
} from "firebase/firestore";
import Link from "next/link";

interface Stats {
  totalOrders: number;
  totalRevenue: number;
  totalCustomers: number;
  avgRating: number;
  pendingOrders: number;
  todayOrders: number;
  weeklyGrowth: number;
  revenueGrowth: number;
}

interface RecentOrder {
  id: string;
  customerName: string;
  total: number;
  status: string;
  createdAt: string;
  items: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    totalOrders: 0,
    totalRevenue: 0,
    totalCustomers: 0,
    avgRating: 0,
    pendingOrders: 0,
    todayOrders: 0,
    weeklyGrowth: 0.0,
    revenueGrowth: 0.0,
  });
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          router.push("/login");
          return;
        }

        // Get store ID from user document or query
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);
        
        let storeId = userDoc.data()?.storeId;

        // If no storeId in user doc, query by ownerId
        if (!storeId) {
          const storesRef = collection(db, "stores");
          const q = query(storesRef, where("ownerId", "==", user.uid));
          const storeSnapshot = await getDocs(q);
          
          if (!storeSnapshot.empty) {
            const storeDoc = storeSnapshot.docs[0];
            storeId = storeDoc.id;
            setStoreName(storeDoc.data().name || "My Store");
          } else {
            router.push("/store/create");
            return;
          }
        } else {
          // Get store name
          const storeRef = doc(db, "stores", storeId);
          const storeDoc = await getDoc(storeRef);
          if (storeDoc.exists()) {
            setStoreName(storeDoc.data().name || "My Store");
          }
        }

        setStoreId(storeId);

        // Fetch orders for this store
        const ordersRef = collection(db, "orders");
        const q = query(
          ordersRef,
          where("storeId", "==", storeId),
          orderBy("createdAt", "desc"),
          limit(10)
        );
        const ordersSnapshot = await getDocs(q);

        const orders: RecentOrder[] = [];
        let totalRevenue = 0;
        let pendingCount = 0;
        let todayCount = 0;
        const customers = new Set();

        ordersSnapshot.forEach((doc) => {
          const data = doc.data();
          const order = {
            id: doc.id,
            customerName: data.customerName || "Customer",
            total: data.total || 0,
            status: data.status || "pending",
            createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            items: data.items?.length || 0,
          };
          orders.push(order);
          totalRevenue += order.total;
          
          if (data.customerId) {
            customers.add(data.customerId);
          }
          
          if (order.status === "pending") pendingCount++;
          
          const orderDate = new Date(order.createdAt);
          const today = new Date();
          if (orderDate.toDateString() === today.toDateString()) {
            todayCount++;
          }
        });

        setRecentOrders(orders);
        setStats({
          totalOrders: orders.length,
          totalRevenue,
          totalCustomers: customers.size || Math.floor(orders.length * 0.7),
          avgRating: 0.0,
          pendingOrders: pendingCount,
          todayOrders: todayCount,
          weeklyGrowth: 0.0,
          revenueGrowth: 0.0,
        });

      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const statusColors = {
    pending: "bg-yellow-100 text-yellow-800",
    accepted: "bg-blue-100 text-blue-800",
    preparing: "bg-purple-100 text-purple-800",
    ready: "bg-indigo-100 text-indigo-800",
    out_for_delivery: "bg-orange-100 text-orange-800",
    delivered: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
  };

  const statusLabels = {
    pending: "Pending",
    accepted: "Accepted",
    preparing: "Preparing",
    ready: "Ready",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    cancelled: "Cancelled",
  };

  const statCards = [
    {
      title: "Total Orders",
      value: stats.totalOrders,
      icon: ShoppingBag,
      color: "bg-blue-500",
      bgColor: "bg-blue-50",
      textColor: "text-blue-600",
    },

    
    {
      title: "Revenue",
      value: `$${stats.totalRevenue.toFixed(2)}`,
      icon: DollarSign,
      color: "bg-green-500",
      bgColor: "bg-green-50",
      textColor: "text-green-600",
      growth: `+${stats.revenueGrowth}%`,
    }, 

    {
      title: "Customers",
      value: stats.totalCustomers,
      icon: Users,
      color: "bg-purple-500",
      bgColor: "bg-purple-50",
      textColor: "text-purple-600",
    },
    
    {
      title: "Rating",
      value: `${stats.avgRating} ★`,
      icon: Star,
      color: "bg-yellow-500",
      bgColor: "bg-yellow-50",
      textColor: "text-yellow-600",
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <motion.div
        initial={{opacity: 0, y: 20}}
        animate={{opacity: 1, y: 0}}
        className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-6 text-white"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Welcome to {storeName}! 👋</h2>
            <p className="text-orange-100 mt-1">
              Here's what's happening with your store today
            </p>
          </div>
          <div className="flex items-center gap-4 bg-white/20 px-4 py-2 rounded-full">
            <Clock className="w-5 h-5" />
            <span className="font-medium">{stats.todayOrders} orders today</span>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{opacity: 0, y: 20}}
            animate={{opacity: 1, y: 0}}
            transition={{delay: index * 0.05}}
            className="bg-white rounded-2xl p-6 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">{stat.title}</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{stat.value}</p>
                {stat.growth && (
                  <p className="text-xs text-green-600 mt-1">
                    <TrendingUp className="w-3 h-3 inline mr-1" />
                    {stat.growth} this week
                  </p>
                )}
              </div>
              <div className={`${stat.bgColor} p-3 rounded-xl`}>
                <stat.icon className={`w-6 h-6 ${stat.textColor}`} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {label: "View Orders", icon: ShoppingBag, color: "bg-orange-500", href: "/store/store-orders"},
          {label: "Add Product", icon: Package, color: "bg-blue-500", href: "/store/products/add"},
        //  {label: "Earnings", icon: DollarSign, color: "bg-green-500", href: "/store/earnings"},
        //  {label: "Analytics", icon: BarChart3, color: "bg-purple-500", href: "/store/analytics"},
        ].map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="bg-white rounded-xl p-4 text-center hover:shadow-md transition group"
          >
            <div className={`${action.color} w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2`}>
              <action.icon className="w-6 h-6 text-white" />
            </div>
            <p className="text-sm font-medium text-gray-700">{action.label}</p>
          </Link>
        ))}
      </div>

      {/* Recent Orders & Pending */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <motion.div
          initial={{opacity: 0, y: 20}}
          animate={{opacity: 1, y: 0}}
          transition={{delay: 0.2}}
          className="bg-white rounded-2xl p-6 shadow-sm"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800">Recent Orders</h3>
            <Link
              href="/store/store-orders"
              className="text-sm text-orange-600 hover:text-orange-700 flex items-center gap-1"
            >
              View All <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="text-center py-8">
              <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No orders yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentOrders.slice(0, 5).map((order) => (
                <Link
                  key={order.id}
                  href={`/store/store-orders/${order.id}`}
                  className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition"
                >
                  <div className="flex items-center gap-3">
                    <div className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[order.status as keyof typeof statusColors]}`}>
                      {statusLabels[order.status as keyof typeof statusLabels]}
                    </div>
                    <div>
                      <p className="font-medium text-gray-800">{order.customerName}</p>
                      <p className="text-sm text-gray-500">
                        {new Date(order.createdAt).toLocaleDateString()} • {order.items} items
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-800">${order.total.toFixed(2)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </motion.div>

        {/* Pending Orders Alert */}
        <motion.div
          initial={{opacity: 0, y: 20}}
          animate={{opacity: 1, y: 0}}
          transition={{delay: 0.3}}
          className="bg-white rounded-2xl p-6 shadow-sm"
        >
          <h3 className="font-bold text-gray-800 mb-4">Pending Orders</h3>
          
          {stats.pendingOrders > 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="font-semibold text-yellow-800">
                    {stats.pendingOrders} orders waiting
                  </p>
                  <p className="text-yellow-700 text-sm mt-1">
                    These orders need your attention. Accept them to start preparing.
                  </p>
                  <Link
                    href="/store/store-orders?status=pending"
                    className="inline-block mt-3 px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-lg hover:bg-yellow-700 transition"
                  >
                    View Pending Orders
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-gray-500">No pending orders</p>
              <p className="text-sm text-gray-400">All orders are being processed</p>
            </div>
          )}

          {/* Quick Stats */}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">Today's Orders</p>
              <p className="text-lg font-bold text-gray-800">{stats.todayOrders}</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">This Week</p>
              <p className="text-lg font-bold text-gray-800">+{stats.weeklyGrowth}%</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
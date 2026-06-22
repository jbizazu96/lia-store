"use client";

import {useState, useEffect} from "react";
import {motion} from "framer-motion";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Calendar,
  Download,
  Users,
  ShoppingBag,
  DollarSign,
  Star,
  Clock,
  Filter
} from "lucide-react";
import {auth, db} from "@/lib/firebase";
import {collection, query, where, getDocs, doc, getDoc} from "firebase/firestore";

interface AnalyticsData {
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  totalCustomers: number;
  averageRating: number;
  peakHours: number[];
  dailyOrders: number[];
  weeklyGrowth: number;
  revenueGrowth: number;
  topProducts: {name: string; sales: number}[];
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("week");
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalOrders: 0,
    totalRevenue: 0,
    averageOrderValue: 0,
    totalCustomers: 0,
    averageRating: 0,
    peakHours: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dailyOrders: [0, 0, 0, 0, 0, 0, 0],
    weeklyGrowth: 12.5,
    revenueGrowth: 0.0,
    topProducts: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;

        const userDoc = await getDoc(doc(db, "users", user.uid));
        const storeId = userDoc.data()?.storeId;

        if (!storeId) return;

        // Fetch orders
        const ordersRef = collection(db, "orders");
        const q = query(ordersRef, where("storeId", "==", storeId));
        const snapshot = await getDocs(q);

        let totalOrders = 0;
        let totalRevenue = 0;
        const customers = new Set();

        snapshot.forEach((doc) => {
          const data = doc.data();
          totalOrders++;
          totalRevenue += data.total || 0;
          if (data.customerId) {
            customers.add(data.customerId);
          }
        });

        const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

        setAnalytics({
          totalOrders,
          totalRevenue,
          averageOrderValue,
          totalCustomers: customers.size,
          averageRating: 4.5,
          peakHours: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          dailyOrders: [12, 18, 15, 22, 30, 25, 20],
          weeklyGrowth: 12.5,
          revenueGrowth: 0.0,
          topProducts: [
            {name: "Jollof Rice", sales: 45},
            {name: "Plantains", sales: 38},
            {name: "Palm Oil", sales: 32},
          ],
        });

      } catch (error) {
        console.error("Error fetching analytics:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const statCards = [
    {
      title: "Total Orders",
      value: analytics.totalOrders,
      icon: ShoppingBag,
      color: "bg-blue-500",
      bgColor: "bg-blue-50",
      textColor: "text-blue-600",
    },
    {
      title: "Revenue",
      value: `$${analytics.totalRevenue.toFixed(2)}`,
      icon: DollarSign,
      color: "bg-green-500",
      bgColor: "bg-green-50",
      textColor: "text-green-600",
      growth: `+${analytics.revenueGrowth}%`,
    },
    {
      title: "Avg Order Value",
      value: `$${analytics.averageOrderValue.toFixed(2)}`,
      icon: TrendingUp,
      color: "bg-purple-500",
      bgColor: "bg-purple-50",
      textColor: "text-purple-600",
    },
    {
      title: "Total Customers",
      value: analytics.totalCustomers,
      icon: Users,
      color: "bg-orange-500",
      bgColor: "bg-orange-50",
      textColor: "text-orange-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Analytics</h1>
          <p className="text-gray-500 text-sm">Track your store performance</p>
        </div>
        <div className="flex gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500"
          >
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
          </select>
          <button className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Stats */}
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
                    {stat.growth}
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

      {/* Daily Orders Chart (Visual) */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-800">Daily Orders</h3>
          <span className="text-sm text-gray-500">Last 7 days</span>
        </div>
        <div className="flex items-end justify-between h-48 gap-2">
          {analytics.dailyOrders.map((value, index) => {
            const maxValue = Math.max(...analytics.dailyOrders, 1);
            const height = (value / maxValue) * 100;
            const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
            return (
              <div key={index} className="flex-1 flex flex-col items-center">
                <motion.div
                  initial={{height: 0}}
                  animate={{height: `${height}%`}}
                  transition={{duration: 0.8, delay: index * 0.05}}
                  className="w-full max-w-[40px] bg-orange-400 rounded-t-lg hover:bg-orange-500 transition"
                  style={{height: `${height}%`, minHeight: value > 0 ? 20 : 0}}
                />
                <p className="text-xs text-gray-500 mt-2">{days[index]}</p>
                <p className="text-xs font-medium text-gray-700">{value}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Products */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-4">Top Products</h3>
          <div className="space-y-3">
            {analytics.topProducts.map((product, index) => (
              <div key={index} className="flex items-center gap-3">
                <span className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-xs font-medium text-gray-600">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <p className="font-medium text-gray-800">{product.name}</p>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{width: 0}}
                      animate={{width: `${(product.sales / analytics.topProducts[0].sales) * 100}%`}}
                      transition={{duration: 0.8}}
                      className="h-full bg-orange-400 rounded-full"
                    />
                  </div>
                </div>
                <span className="text-sm font-medium text-gray-600">{product.sales}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Insights */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-4">Quick Insights</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-3 bg-green-50 rounded-xl">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-green-800">Orders are up 12.5%</p>
                <p className="text-sm text-green-600">Compared to last week</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-3 bg-blue-50 rounded-xl">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Star className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-blue-800">4.5 ★ Average Rating</p>
                <p className="text-sm text-blue-600">Based on 127 reviews</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-3 bg-purple-50 rounded-xl">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <Clock className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="font-medium text-purple-800">Peak Hours: 6-9 PM</p>
                <p className="text-sm text-purple-600">Highest order volume</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
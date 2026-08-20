"use client";

import {useState, useEffect} from "react";
import {motion} from "framer-motion";
import {
  TrendingUp,
  Download,
  Users,
  ShoppingBag,
  DollarSign,
  Star,
  Clock,
} from "lucide-react";
import {
  storeWorkspaceClientService,
} from "@/services/store/storeWorkspaceClientService";
import { BrandedLoader } from "@/components/ui/BrandedLoader";
import {startStorePerformanceTrace} from "@/services/performance/storePerformanceService";

interface AnalyticsData {
  timeZone: string;
  periodStart: string;
  periodEnd: string;
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  openOrders: number;
  grossMerchandiseSales: number;
  refundedMerchandise: number;
  netMerchandiseSales: number;
  salesTax: number;
  refundedSalesTax: number;
  netSalesTax: number;
  storeCommission: number;
  grossStoreEarnings: number;
  storeRefundImpact: number;
  netStoreEarnings: number;
  completedPayouts: number;
  customerRefundTotal: number;
  refundCount: number;
  averageOrderValue: number;
  totalCustomers: number;
  averageRating: number;
  peakHours: number[];
  orderSeries: Array<{label: string; value: number}>;
  orderGrowth: number;
  revenueGrowth: number;
  topProducts: {name: string; sales: number}[];
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("week");
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    timeZone: "America/Chicago",
    periodStart: "",
    periodEnd: "",
    totalOrders: 0,
    completedOrders: 0,
    cancelledOrders: 0,
    openOrders: 0,
    grossMerchandiseSales: 0,
    refundedMerchandise: 0,
    netMerchandiseSales: 0,
    salesTax: 0,
    refundedSalesTax: 0,
    netSalesTax: 0,
    storeCommission: 0,
    grossStoreEarnings: 0,
    storeRefundImpact: 0,
    netStoreEarnings: 0,
    completedPayouts: 0,
    customerRefundTotal: 0,
    refundCount: 0,
    averageOrderValue: 0,
    totalCustomers: 0,
    averageRating: 0,
    peakHours: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    orderSeries: [],
    orderGrowth: 0,
    revenueGrowth: 0.0,
    topProducts: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{title: string; message: string} | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const fetchAnalytics = async () => {
      const trace = startStorePerformanceTrace("store_analytics_ready");
      let result = "complete";
      try {
        setLoading(true);
        setError(null);
        const response =
          await storeWorkspaceClientService
            .getAnalytics(period as "week" | "month" | "year");

        setAnalytics(response);

      } catch (error) {
        result = "error";
        console.error("Error fetching analytics:", error);
        const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
        setError(!navigator.onLine
          ? {title: "You’re offline", message: "Internet connection is required to load current analytics."}
          : code.includes("permission-denied")
            ? {title: "Analytics access unavailable", message: "Your store account does not currently have permission to view analytics."}
            : {title: "Analytics could not be loaded", message: "A temporary server problem prevented this report from loading. No zero totals are being substituted."});
      } finally {
        trace.stop({result, period});
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [period, reloadKey]);

  const exportAnalytics = () => {
    const rows = [
      ["Metric", "Value"],
      ["Period", period],
      ["Orders", analytics.totalOrders],
      ["Timezone", analytics.timeZone],
      ["Period start", analytics.periodStart],
      ["Period end", analytics.periodEnd],
      ["Paid orders", analytics.totalOrders],
      ["Completed orders", analytics.completedOrders],
      ["Cancelled orders", analytics.cancelledOrders],
      ["Open orders", analytics.openOrders],
      ["Gross merchandise sales", analytics.grossMerchandiseSales.toFixed(2)],
      ["Refunded merchandise", analytics.refundedMerchandise.toFixed(2)],
      ["Net merchandise sales", analytics.netMerchandiseSales.toFixed(2)],
      ["Sales tax", analytics.salesTax.toFixed(2)],
      ["Refunded sales tax", analytics.refundedSalesTax.toFixed(2)],
      ["Net sales tax", analytics.netSalesTax.toFixed(2)],
      ["Store commission", analytics.storeCommission.toFixed(2)],
      ["Gross store earnings", analytics.grossStoreEarnings.toFixed(2)],
      ["Store refund impact", analytics.storeRefundImpact.toFixed(2)],
      ["Net store earnings", analytics.netStoreEarnings.toFixed(2)],
      ["Completed payouts", analytics.completedPayouts.toFixed(2)],
      ["Customer refunds", analytics.customerRefundTotal.toFixed(2)],
      ["Completed refunds", analytics.refundCount],
      ["Average net merchandise per paid order", analytics.averageOrderValue.toFixed(2)],
      ["Customers", analytics.totalCustomers],
      ...analytics.orderSeries.map((entry) => [`Orders ${entry.label}`, entry.value]),
      ...analytics.topProducts.map((product) => [`Units ordered ${product.name}`, product.sales]),
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = `store-analytics-${period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <BrandedLoader message="Loading Analytics" />;
  }

  if (error) return <div className="rounded-xl border border-red-100 bg-white p-8 text-center"><h2 className="font-bold text-gray-900">{error.title}</h2><p className="mt-2 text-sm text-gray-600">{error.message}</p><button type="button" onClick={() => setReloadKey((key) => key + 1)} className="mt-4 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white">Retry</button></div>;

  const statCards = [
    {
      title: "Paid Orders",
      value: analytics.totalOrders,
      icon: ShoppingBag,
      color: "bg-blue-500",
      bgColor: "bg-blue-50",
      textColor: "text-blue-600",
    },
    {
      title: "Net Store Earnings",
      value: `$${analytics.netStoreEarnings.toFixed(2)}`,
      icon: DollarSign,
      color: "bg-green-500",
      bgColor: "bg-green-50",
      textColor: "text-green-600",
      growth: `${analytics.revenueGrowth >= 0 ? "+" : ""}${analytics.revenueGrowth.toFixed(1)}%`,
    },
    {
      title: "Avg Net Sale / Order",
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
          <p className="text-gray-500 text-sm">Authoritative calendar-period performance · {analytics.timeZone.replaceAll("_", " ")}</p>
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
          <button type="button" onClick={exportAnalytics} className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition flex items-center gap-2">
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

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="font-bold text-gray-800">Order accounting</h3>
          <p className="mt-1 text-xs text-gray-500">Paid orders are grouped by their Stripe payment time in the store timezone.</p>
          <dl className="mt-4 divide-y divide-gray-100 text-sm">
            {[
              ["Gross merchandise sales", analytics.grossMerchandiseSales],
              ["Refunded merchandise", -analytics.refundedMerchandise],
              ["Net merchandise sales", analytics.netMerchandiseSales],
              ["Sales tax recorded", analytics.salesTax],
              ["Refunded sales tax", -analytics.refundedSalesTax],
              ["Net sales tax", analytics.netSalesTax],
            ].map(([label, amount]) => <div key={String(label)} className="flex justify-between py-3"><dt className="text-gray-600">{label}</dt><dd className="font-semibold text-gray-900">{Number(amount) < 0 ? "−" : ""}${Math.abs(Number(amount)).toFixed(2)}</dd></div>)}
          </dl>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="font-bold text-gray-800">Store settlement accounting</h3>
          <p className="mt-1 text-xs text-gray-500">Earnings use immutable settlements and completed store refund reversals. Payouts use transfer completion time.</p>
          <dl className="mt-4 divide-y divide-gray-100 text-sm">
            {[
              ["Gross store earnings", analytics.grossStoreEarnings],
              ["LIA store commission", -analytics.storeCommission],
              ["Refund impact", -analytics.storeRefundImpact],
              ["Net store earnings", analytics.netStoreEarnings],
              ["Completed payouts this period", analytics.completedPayouts],
              ["Customer refunds (all components)", -analytics.customerRefundTotal],
            ].map(([label, amount]) => <div key={String(label)} className="flex justify-between py-3"><dt className="text-gray-600">{label}</dt><dd className="font-semibold text-gray-900">{Number(amount) < 0 ? "−" : ""}${Math.abs(Number(amount)).toFixed(2)}</dd></div>)}
          </dl>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-gray-500">Completed orders</p><p className="mt-1 text-xl font-bold text-gray-900">{analytics.completedOrders}</p></div>
        <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-gray-500">Open orders</p><p className="mt-1 text-xl font-bold text-gray-900">{analytics.openOrders}</p></div>
        <div className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-gray-500">Cancelled orders</p><p className="mt-1 text-xl font-bold text-gray-900">{analytics.cancelledOrders}</p></div>
      </div>

      {/* Daily Orders Chart (Visual) */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-800">Daily Orders</h3>
          <span className="text-sm text-gray-500">Selected period</span>
        </div>
        <div className="flex items-end justify-between h-48 gap-2">
          {analytics.orderSeries.map((entry) => {
            const maxValue = Math.max(...analytics.orderSeries.map((item) => item.value), 1);
            const height = (entry.value / maxValue) * 100;
            return (
              <div key={entry.label} className="flex min-w-5 flex-1 flex-col items-center">
                <motion.div
                  initial={{height: 0}}
                  animate={{height: `${height}%`}}
                  transition={{duration: 0.5}}
                  className="w-full max-w-[40px] bg-orange-400 rounded-t-lg hover:bg-orange-500 transition"
                  style={{height: `${height}%`, minHeight: entry.value > 0 ? 20 : 0}}
                />
                <p className="mt-2 max-w-14 truncate text-[10px] text-gray-500">{entry.label.slice(5)}</p>
                <p className="text-xs font-medium text-gray-700">{entry.value}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Most Ordered Products */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-gray-800 mb-1">Most Ordered Products</h3>
          <p className="mb-4 text-xs text-gray-500">Original units in paid orders; product-level refund quantities are not inferred.</p>
          <div className="space-y-3">
            {analytics.topProducts.length === 0 && <p className="py-8 text-center text-sm text-gray-500">No product sales in this period.</p>}
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
                      animate={{width: `${analytics.topProducts[0].sales > 0 ? (product.sales / analytics.topProducts[0].sales) * 100 : 0}%`}}
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
                <p className="font-medium text-green-800">Orders {analytics.orderGrowth >= 0 ? "increased" : "decreased"} {Math.abs(analytics.orderGrowth).toFixed(1)}%</p>
                <p className="text-sm text-green-600">Compared with the previous period</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-3 bg-blue-50 rounded-xl">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Star className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-blue-800">{analytics.averageRating > 0 ? `${analytics.averageRating.toFixed(1)} ★ Average Rating` : "No rating yet"}</p>
                <p className="text-sm text-blue-600">Current verified store rating</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-3 bg-purple-50 rounded-xl">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <Clock className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="font-medium text-purple-800">{Math.max(...analytics.peakHours) > 0 ? `Peak hour: ${analytics.peakHours.indexOf(Math.max(...analytics.peakHours))}:00` : "No peak hour yet"}</p>
                <p className="text-sm text-purple-600">Measured from this period&apos;s orders</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

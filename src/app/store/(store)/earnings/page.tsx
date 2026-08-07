"use client";
import {PageContentSkeleton} from "@/components/ui/PageContentSkeleton";
import {useState, useEffect} from "react";
import {motion} from "framer-motion";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  Download,
  Eye,
  ChevronRight,
} from "lucide-react";
import {
  storeWorkspaceClientService,
  type StoreWorkspacePayout,
} from "@/services/store/storeWorkspaceClientService";
import {
  PayoutDetailModal,
} from "@/components/store/earnings/PayoutDetailModal";
import Link from "next/link";

export default function EarningsPage() {
  const [stats, setStats] = useState({
    totalEarnings: 0,
    availableBalance: 0,
    pendingBalance: 0,
    weeklyEarnings: 0,
    monthlyEarnings: 0,
  });
  const [payouts, setPayouts] = useState<StoreWorkspacePayout[]>([]);
  const [selectedPayout, setSelectedPayout] = useState<StoreWorkspacePayout | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const financials =
          await storeWorkspaceClientService
            .getFinancials();

        setPayouts(financials.earnings.payouts);
        setStats({
          totalEarnings: financials.earnings.totalEarnings,
          availableBalance: financials.earnings.availableBalance,
          pendingBalance: financials.earnings.pendingBalance,
          weeklyEarnings: financials.earnings.weeklyEarnings,
          monthlyEarnings: financials.earnings.monthlyEarnings,
        });

      } catch (error) {
        console.error("Error fetching earnings:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  /* ==========================================
     LOADING STATE - WHITE BRANDED LOADER
  ========================================== */

    if (loading) {
  return <PageContentSkeleton />;
}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Earnings</h1>
          <p className="text-gray-500 text-sm">Track your store revenue and payouts</p>
        </div>
        <div className="flex gap-2">
          <button 
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition flex items-center gap-2"
            aria-label="Filter earnings by date"
          >
            <Calendar className="w-4 h-4" />
            Filter
          </button>
          <button 
            className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition flex items-center gap-2"
            aria-label="Export earnings data"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            title: "Total Earnings",
            value: `$${stats.totalEarnings.toFixed(2)}`,
            icon: DollarSign,
            color: "bg-blue-500",
            bgColor: "bg-blue-50",
            textColor: "text-blue-600",
          },
          {
            title: "This Week",
            value: `$${stats.weeklyEarnings.toFixed(2)}`,
            icon: TrendingUp,
            color: "bg-green-500",
            bgColor: "bg-green-50",
            textColor: "text-green-600",
          },
          {
            title: "Pending Balance",
            value: `$${stats.pendingBalance.toFixed(2)}`,
            icon: TrendingDown,
            color: "bg-yellow-500",
            bgColor: "bg-yellow-50",
            textColor: "text-yellow-600",
          },
          {
            title: "This Month",
            value: `$${stats.monthlyEarnings.toFixed(2)}`,
            icon: Calendar,
            color: "bg-purple-500",
            bgColor: "bg-purple-50",
            textColor: "text-purple-600",
          },
        ].map((stat, index) => (
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
              </div>
              <div className={`${stat.bgColor} p-3 rounded-xl`}>
                <stat.icon className={`w-6 h-6 ${stat.textColor}`} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Payout History */}
      <div className="bg-white rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-800">Payout History</h3>
          <Link
            href="/store/earnings/payouts"
            className="text-sm text-orange-600 hover:text-orange-700 flex items-center gap-1"
          >
            View All <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="space-y-3">
          {payouts.slice(0, 10).map((payout) => (
            <button
              key={payout.id}
              type="button"
              onClick={() => setSelectedPayout(payout)}
              className="flex w-full items-center justify-between rounded-xl p-3 text-left transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              aria-label={`View payout details for $${payout.amount.toFixed(2)}`}
            >
              <div>
                <p className="font-medium text-gray-800">${payout.amount.toFixed(2)}</p>
                <p className="text-sm text-gray-500">{payout.date} • {payout.method}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                  payout.status === "completed"
                    ? "bg-green-100 text-green-800"
                    : payout.status === "pending"
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-red-100 text-red-800"
                }`}>
                  {payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                </span>
                <span className="rounded-lg p-1" aria-hidden="true">
                  <Eye className="w-4 h-4 text-gray-400" />
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedPayout && (
        <PayoutDetailModal
          payout={selectedPayout}
          onClose={() => setSelectedPayout(null)}
        />
      )}

      {/* Stripe Connect Status */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-2xl p-6 border border-blue-200">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
            <DollarSign className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-blue-800">Stripe Connect</h3>
            <p className="text-blue-700 text-sm">
              Your account is connected and ready to receive payments.
              Payouts are processed every Monday.
            </p>
            <Link
              href="/store/settings?section=payment"
              className="mt-3 inline-flex px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
              aria-label="Manage Stripe payment settings"
            >
              Manage Payment Settings
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";
import {PageContentSkeleton} from "@/components/ui/PageContentSkeleton";
import dynamic from "next/dynamic";
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
import Link from "next/link";
import {startStorePerformanceTrace} from "@/services/performance/storePerformanceService";

const PayoutDetailModal = dynamic(() => import("@/components/store/earnings/PayoutDetailModal").then((module) => module.PayoutDetailModal));

export default function EarningsPage() {
  const [stats, setStats] = useState({
    totalEarnings: 0,
    grossStoreEarnings: 0,
    storeCommission: 0,
    refundDeductions: 0,
    grossMerchandiseSales: 0,
    salesTax: 0,
    availableBalance: null as number | null,
    stripePendingBalance: null as number | null,
    pendingBalance: 0,
    weeklyEarnings: 0,
    monthlyEarnings: 0,
    timeZone: "America/Chicago",
    stripe: {accountId: null as string | null, status: "not_started", isReady: false, payoutsEnabled: false, requiresAction: false},
  });
  const [payouts, setPayouts] = useState<StoreWorkspacePayout[]>([]);
  const [selectedPayout, setSelectedPayout] = useState<StoreWorkspacePayout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{title: string; message: string} | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      const trace = startStorePerformanceTrace("store_financials_ready");
      let result = "complete";
      try {
        setLoading(true);
        setError(null);
        const financials =
          await storeWorkspaceClientService
            .getFinancials();

        setPayouts(financials.earnings.payouts);
        setStats({
          totalEarnings: financials.earnings.totalEarnings,
          grossStoreEarnings: financials.earnings.grossStoreEarnings,
          storeCommission: financials.earnings.storeCommission,
          refundDeductions: financials.earnings.refundDeductions,
          grossMerchandiseSales: financials.earnings.grossMerchandiseSales,
          salesTax: financials.earnings.salesTax,
          availableBalance: financials.earnings.availableBalance,
          stripePendingBalance: financials.earnings.stripePendingBalance,
          pendingBalance: financials.earnings.pendingBalance,
          weeklyEarnings: financials.earnings.weeklyEarnings,
          monthlyEarnings: financials.earnings.monthlyEarnings,
          timeZone: financials.earnings.timeZone,
          stripe: financials.earnings.stripe,
        });

      } catch (error) {
        result = "error";
        console.error("Error fetching earnings:", error);
        const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
        setError(!navigator.onLine
          ? {title: "You’re offline", message: "Internet connection is required to load current earnings."}
          : code.includes("permission-denied")
            ? {title: "Earnings access unavailable", message: "Your store account does not currently have permission to view financial data."}
            : {title: "Earnings could not be loaded", message: "A temporary server problem prevented current totals from loading. Your balances have not been replaced with zero."});
      } finally {
        trace.stop({result});
        setLoading(false);
      }
    };

    fetchData();
  }, [reloadKey]);

  /* ==========================================
     LOADING STATE - WHITE BRANDED LOADER
  ========================================== */

    if (loading) {
  return <PageContentSkeleton />;
}

  if (error) {
    return <div className="rounded-xl border border-red-100 bg-white p-8 text-center"><h2 className="font-bold text-gray-900">{error.title}</h2><p className="mt-2 text-sm text-gray-600">{error.message}</p><button type="button" onClick={() => setReloadKey((key) => key + 1)} className="mt-4 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white">Retry</button></div>;
  }

  const exportEarnings = () => {
    const rows = [
      ["Metric", "USD"],
      ["Timezone", stats.timeZone],
      ["Gross merchandise sales", stats.grossMerchandiseSales.toFixed(2)],
      ["Sales tax passed to store", stats.salesTax.toFixed(2)],
      ["Gross store earnings", stats.grossStoreEarnings.toFixed(2)],
      ["LIA commission", stats.storeCommission.toFixed(2)],
      ["Completed refund deductions", stats.refundDeductions.toFixed(2)],
      ["Net lifetime earnings", stats.totalEarnings.toFixed(2)],
      ["Pending LIA transfers", stats.pendingBalance.toFixed(2)],
      ["Stripe available balance", stats.availableBalance?.toFixed(2) ?? "Unavailable"],
      ["Stripe pending balance", stats.stripePendingBalance?.toFixed(2) ?? "Unavailable"],
      ["Current calendar week earnings", stats.weeklyEarnings.toFixed(2)],
      ["Current calendar month earnings", stats.monthlyEarnings.toFixed(2)],
    ];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = "store-earnings.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Earnings</h1>
          <p className="text-gray-500 text-sm">Reconciled earnings and payouts · {stats.timeZone.replaceAll("_", " ")}</p>
        </div>
        <div className="flex gap-2">
          <button 
            type="button"
            onClick={exportEarnings}
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
            title: "Net Lifetime Earnings",
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
            title: "Pending LIA Transfer",
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

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="font-bold text-gray-800">Store earnings reconciliation</h3>
          <p className="mt-1 text-xs leading-5 text-gray-500">The store receives merchandise and sales tax, less LIA commission and completed store refund reversals. Stripe processing fees are paid entirely by LIA.</p>
          <dl className="mt-4 divide-y divide-gray-100 text-sm">
            {[
              ["Gross merchandise sales", stats.grossMerchandiseSales, false],
              ["Sales tax passed to store", stats.salesTax, false],
              ["LIA commission", stats.storeCommission, true],
              ["Completed refund deductions", stats.refundDeductions, true],
              ["Net lifetime earnings", stats.totalEarnings, false],
            ].map(([label, amount, deduction]) => <div key={String(label)} className="flex justify-between py-3"><dt className="text-gray-600">{label}</dt><dd className="font-semibold text-gray-900">{deduction && Number(amount) > 0 ? "−" : ""}${Number(amount).toFixed(2)}</dd></div>)}
          </dl>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="font-bold text-gray-800">Balance reconciliation</h3>
          <p className="mt-1 text-xs leading-5 text-gray-500">LIA transfer obligations and the connected Stripe account balance are different stages of the payout flow.</p>
          <dl className="mt-4 divide-y divide-gray-100 text-sm">
            <div className="flex justify-between py-3"><dt className="text-gray-600">Pending from LIA</dt><dd className="font-semibold text-gray-900">${stats.pendingBalance.toFixed(2)}</dd></div>
            <div className="flex justify-between py-3"><dt className="text-gray-600">Available in Stripe</dt><dd className="font-semibold text-gray-900">{stats.availableBalance === null ? "Unavailable" : `$${stats.availableBalance.toFixed(2)}`}</dd></div>
            <div className="flex justify-between py-3"><dt className="text-gray-600">Pending in Stripe</dt><dd className="font-semibold text-gray-900">{stats.stripePendingBalance === null ? "Unavailable" : `$${stats.stripePendingBalance.toFixed(2)}`}</dd></div>
          </dl>
        </div>
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
              {stats.stripe.isReady && stats.stripe.payoutsEnabled
                ? "Your Stripe account is connected and enabled for payouts. Stripe controls the final bank payout timing."
                : stats.stripe.requiresAction
                  ? "Stripe needs additional information before payouts can continue."
                  : "Complete Stripe setup before store payouts can be received."}
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

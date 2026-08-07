"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
} from "react";
import {
  ArrowLeft,
  Eye,
} from "lucide-react";
import {
  BrandedLoader,
} from "@/components/ui/BrandedLoader";
import {
  PayoutDetailModal,
} from "@/components/store/earnings/PayoutDetailModal";
import {
  storeWorkspaceClientService,
  type StoreWorkspacePayout,
} from "@/services/store/storeWorkspaceClientService";

function statusClass(status: StoreWorkspacePayout["status"]): string {
  if (status === "completed") return "bg-green-100 text-green-800";
  if (status === "pending") return "bg-yellow-100 text-yellow-800";
  return "bg-red-100 text-red-800";
}

/*
 * Full payout history remains server-authorized and is loaded in small pages,
 * so opening the page stays fast as a store's transfer history grows.
 */
export default function StorePayoutHistoryPage() {
  const [payouts, setPayouts] = useState<StoreWorkspacePayout[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedPayout, setSelectedPayout] = useState<StoreWorkspacePayout | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadInitialPayouts = async () => {
      try {
        const result = await storeWorkspaceClientService.getPayouts();
        if (!isMounted) return;
        setPayouts(result.payouts);
        setNextCursor(result.nextCursor);
      } catch (loadError) {
        console.error("Error loading payout history:", loadError);
        if (isMounted) setError("Payout history could not be loaded. Please try again.");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadInitialPayouts();
    return () => {
      isMounted = false;
    };
  }, []);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;

    setLoadingMore(true);
    try {
      const result = await storeWorkspaceClientService.getPayouts(25, nextCursor);
      setPayouts((current) => [...current, ...result.payouts]);
      setNextCursor(result.nextCursor);
    } catch (loadError) {
      console.error("Error loading more payouts:", loadError);
      setError("More payouts could not be loaded. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) return <BrandedLoader message="Loading payout history" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/store/earnings"
          className="rounded-xl border border-gray-200 p-2 text-gray-600 transition hover:bg-gray-50"
          aria-label="Back to earnings"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Payout History</h1>
          <p className="text-sm text-gray-500">Your store&apos;s completed and pending earnings.</p>
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        {payouts.length === 0 ? (
          <div className="px-6 py-14 text-center text-sm text-gray-500">No payouts yet.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {payouts.map((payout) => (
              <button
                key={payout.id}
                type="button"
                onClick={() => setSelectedPayout(payout)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500"
                aria-label={`View payout details for $${payout.amount.toFixed(2)}`}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800">${payout.amount.toFixed(2)}</p>
                  <p className="mt-1 text-sm text-gray-500">{payout.date} · {payout.method}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(payout.status)}`}>
                    {payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                  </span>
                  <Eye className="h-4 w-4 text-gray-400" aria-hidden="true" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {nextCursor && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMore ? "Loading…" : "Load more payouts"}
          </button>
        </div>
      )}

      {selectedPayout && (
        <PayoutDetailModal
          payout={selectedPayout}
          onClose={() => setSelectedPayout(null)}
        />
      )}
    </div>
  );
}

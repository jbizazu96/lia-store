"use client";

/*
|--------------------------------------------------------------------------
| Admin Overview Page
|--------------------------------------------------------------------------
|
| The opening Admin screen is a review queue. It intentionally exposes only
| aggregate operational counts; private records are reviewed through future
| protected detail pages rather than from browser Firestore queries.
|
*/

import {
  useEffect,
  useState,
} from "react";
import {
  AlertTriangle,
  Building2,
  CreditCard,
  FileWarning,
  ShieldAlert,
  Truck,
  Users,
  ClipboardList,
} from "lucide-react";
import {
  PageContentSkeleton,
} from "@/components/ui/PageContentSkeleton";
import {
  adminWorkspaceClientService,
} from "@/services/admin/adminWorkspaceClientService";
import type {
  AdminWorkspaceOverview,
} from "@/types/adminWorkspace";

const cards = (overview: AdminWorkspaceOverview) => [
  {label: "Store applications", value: overview.reviewQueue.pendingStoreApplications, icon: Building2, tone: "text-orange-700 bg-orange-50"},
  {label: "Driver applications", value: overview.reviewQueue.pendingDriverApplications, icon: Truck, tone: "text-blue-700 bg-blue-50"},
  {label: "Deletion requests", value: overview.reviewQueue.pendingDeletionRequests, icon: FileWarning, tone: "text-violet-700 bg-violet-50"},
  {label: "Failed transfers", value: overview.reviewQueue.failedTransfers, icon: CreditCard, tone: "text-red-700 bg-red-50"},
  {label: "Pending refunds", value: overview.reviewQueue.pendingRefunds, icon: AlertTriangle, tone: "text-amber-800 bg-amber-50"},
];

const totalCards = (overview: AdminWorkspaceOverview) => [
  {label: "Total stores", value: overview.reviewQueue.totalStores, icon: Building2, tone: "text-orange-700 bg-orange-50"},
  {label: "Total drivers", value: overview.reviewQueue.totalDrivers, icon: Truck, tone: "text-blue-700 bg-blue-50"},
  {label: "Total customers", value: overview.reviewQueue.totalCustomers, icon: Users, tone: "text-green-700 bg-green-50"},
  {label: "Total platform orders", value: overview.reviewQueue.totalOrders, icon: ClipboardList, tone: "text-blue-700 bg-blue-50"},
];

export default function AdminOverviewPage() {
  const [overview, setOverview] = useState<AdminWorkspaceOverview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    void adminWorkspaceClientService.getOverview()
      .then((result) => {
        if (active) setOverview(result);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load the administrative review queue."
        );
      });

    return () => {
      active = false;
    };
  }, []);

  if (!overview && !error) return <PageContentSkeleton />;

  if (error) {
    return (
      <section className="mx-auto flex min-h-[60vh] max-w-lg items-center">
        <div className="w-full rounded-2xl border border-red-100 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold">Unable to load Admin overview</h1>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
        </div>
      </section>
    );
  }

  const loadedOverview = overview;

  if (!loadedOverview) return null;

  return (
    <section>
      <p className="text-sm font-bold tracking-wide text-orange-600">ADMIN OVERVIEW</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Platform overview</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Monitor total platform accounts and work that needs an administrator decision.</p>

      <h2 className="mt-7 text-lg font-bold text-slate-900">Platform totals</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {totalCards(loadedOverview).map((card) => {
          const Icon = card.icon;
          return <article key={card.label} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><div className={`inline-flex rounded-xl p-2.5 ${card.tone}`}><Icon className="h-5 w-5" /></div><p className="mt-4 text-3xl font-bold text-slate-950">{card.value}</p><p className="mt-1 text-sm font-medium text-slate-500">{card.label}</p></article>;
        })}
      </div>

      <h2 className="mt-8 text-lg font-bold text-slate-900">Review queue</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards(loadedOverview).map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.label} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
              <div className={`inline-flex rounded-xl p-2.5 ${card.tone}`}><Icon className="h-5 w-5" /></div>
              <p className="mt-4 text-3xl font-bold text-slate-950">{card.value}</p>
              <p className="mt-1 text-sm font-medium text-slate-500">{card.label}</p>
            </article>
          );
        })}
      </div>

      <article className="mt-7 rounded-2xl border border-orange-100 bg-orange-50/50 p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-orange-700" />
          <div>
            <h2 className="font-bold text-slate-900">Admin actions are server protected</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">Approvals, suspensions, refunds, payouts, and deletion decisions will be added as audited server actions. This dashboard does not expose private application records to the browser.</p>
          </div>
        </div>
      </article>
    </section>
  );
}

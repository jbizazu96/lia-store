"use client";

import { useEffect, useState } from "react";
import { Banknote, CheckCircle2, Clock3, FileCheck2, ShieldAlert, WalletCards } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { PageContentSkeleton } from "@/components/ui/PageContentSkeleton";
import { auth, db } from "@/lib/firebase";
import { driverWorkspaceClientService } from "@/services/driver/driverWorkspaceClientService";
import type { DriverWorkspaceSummary } from "@/types/driverWorkspace";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
function statusInfo(status: DriverWorkspaceSummary["status"]) { if (status === "approved") return ["Approved", "bg-green-100 text-green-700", CheckCircle2] as const; if (status === "suspended") return ["Suspended", "bg-red-100 text-red-700", ShieldAlert] as const; return ["Pending approval", "bg-amber-100 text-amber-800", Clock3] as const; }

export default function DriverDashboardPage() {
  const [summary, setSummary] = useState<DriverWorkspaceSummary | null>(null);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  useEffect(() => {
    let unsubscribeStatus: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeStatus?.();
      unsubscribeStatus = null;

      if (!user) {
        setSummary(null);
        return;
      }

      setError("");
      void driverWorkspaceClientService.getSummary()
        .then(setSummary)
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load the dashboard."));

      /* The projection intentionally excludes address, vehicle, and document URLs. */
      unsubscribeStatus = onSnapshot(
        doc(db, "driverWorkspaceStatuses", user.uid),
        (snapshot) => {
          if (!snapshot.exists()) return;

          const status = snapshot.data();
          setSummary((current) => current
            ? {
                ...current,
                onboardingCompleted: status.onboardingCompleted === true,
                onboardingStep: typeof status.onboardingStep === "string"
                  ? status.onboardingStep
                  : current.onboardingStep,
                status: status.status === "approved" ||
                  status.status === "suspended" ||
                  status.status === "rejected" ||
                  status.status === "pending_review"
                  ? status.status
                  : "draft",
                isApproved: status.isApproved === true,
                stripe: status.stripe && typeof status.stripe === "object"
                  ? {
                      status: typeof status.stripe.status === "string"
                        ? status.stripe.status
                        : current.stripe.status,
                      transfersEnabled: status.stripe.transfersEnabled === true,
                      payoutsEnabled: status.stripe.payoutsEnabled === true,
                      requiresAction: status.stripe.requiresAction === true,
                    }
                  : current.stripe,
                documents: Array.isArray(status.documents)
                  ? status.documents.flatMap((document) => {
                      if (!document || typeof document !== "object") return [];
                      const value = document as Record<string, unknown>;
                      const reviewStatus = value.reviewStatus;
                      if (typeof value.label !== "string" ||
                        !["pending", "approved", "rejected", "expired", "missing"].includes(String(reviewStatus))) {
                        return [];
                      }
                      return [{
                        label: value.label,
                        reviewStatus: reviewStatus as DriverWorkspaceSummary["documents"][number]["reviewStatus"],
                        expirationDate: typeof value.expirationDate === "string"
                          ? value.expirationDate
                          : undefined,
                      }];
                    })
                  : current.documents,
              }
            : current);
        },
        (listenerError) => {
          console.error("Unable to listen to driver workspace status:", listenerError);
        },
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeStatus?.();
    };
  }, [retryKey]);
  if (!summary && error) return <section className="mx-auto max-w-xl rounded-2xl bg-white p-6 shadow-sm"><h1 className="text-xl font-bold">Unable to load the driver dashboard</h1><p className="mt-2 text-sm text-slate-600">{error}</p><button type="button" onClick={() => setRetryKey((current) => current + 1)} className="mt-4 rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white">Retry</button></section>;
  if (!summary) return <PageContentSkeleton />;
  const [label, color, Icon] = statusInfo(summary.status);
  const docsApproved = summary.documents.filter((document) => document.reviewStatus === "approved").length;
  return <section className="mx-auto max-w-4xl"><p className="text-sm font-semibold text-orange-600">DRIVER DASHBOARD</p><h1 className="mt-1 text-3xl font-bold">Welcome {summary.firstName}</h1><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><p className="text-sm text-slate-500">Status</p><div className={`mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ${color}`}><Icon className="h-4 w-4" />{label}</div></article><article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><p className="text-sm text-slate-500">Stripe status</p><p className="mt-3 text-lg font-bold capitalize">{summary.stripe.status.replaceAll("_", " ")}</p></article><article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><p className="text-sm text-slate-500">Documents</p><p className="mt-3 text-lg font-bold">{docsApproved}/{summary.documents.length} approved</p></article><article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><p className="text-sm text-slate-500">Total earnings</p><p className="mt-3 text-lg font-bold">{money(summary.totals.lifetime)}</p></article></div><div className="mt-6 grid gap-4 md:grid-cols-2"><article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><div className="flex items-center gap-2 font-bold"><Banknote className="h-5 w-5 text-green-600" />Last payment</div><p className="mt-4 text-2xl font-bold">{summary.lastPayment ? money(summary.lastPayment.amount) : "No payments yet"}</p>{summary.lastPayment && <p className="mt-1 text-sm text-slate-500">Order {summary.lastPayment.orderNumber ?? "Unavailable"}</p>}</article><article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><div className="flex items-center gap-2 font-bold"><WalletCards className="h-5 w-5 text-orange-600" />Payout readiness</div><p className="mt-4 text-sm text-slate-600">{summary.stripe.payoutsEnabled ? "Your payout account is ready." : "Complete or update Stripe Connect to receive payouts."}</p></article></div><article className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><div className="flex items-center gap-2 font-bold"><FileCheck2 className="h-5 w-5 text-orange-600" />Document review</div><div className="mt-4 grid gap-3 sm:grid-cols-3">{summary.documents.map((document) => <div key={document.label} className="rounded-xl bg-slate-50 p-3"><p className="text-sm font-medium">{document.label}</p><p className="mt-1 text-sm capitalize text-slate-500">{document.reviewStatus}</p><p className="mt-1 text-xs text-slate-400">{document.expirationDate ? `Expires ${new Date(`${document.expirationDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "No expiration date"}</p></div>)}</div></article></section>;
}

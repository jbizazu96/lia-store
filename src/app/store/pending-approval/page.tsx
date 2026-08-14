"use client";
/* eslint-disable react-hooks/set-state-in-effect -- the entry effect initializes status before attaching the live listener */

import {useCallback, useEffect, useMemo, useState} from "react";
import {doc, onSnapshot} from "firebase/firestore";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FilePenLine,
  LogOut,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import {useRouter} from "next/navigation";
import {RoleGuard} from "@/components/auth/RoleGuard";
import {BrandedLoader} from "@/components/ui/BrandedLoader";
import {auth, db} from "@/lib/firebase";
import {customerLogoutService} from "@/services/auth/customerLogoutService";
import {
  storeWorkspaceClientService,
  type StoreWorkspaceEntry,
} from "@/services/store/storeWorkspaceClientService";

type StoreLifecycle = NonNullable<StoreWorkspaceEntry["store"]>;

function PendingApprovalContent() {
  const router = useRouter();
  const [store, setStore] = useState<StoreLifecycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [reopening, setReopening] = useState(false);
  const [error, setError] = useState("");

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const entry = await storeWorkspaceClientService.getEntry(true);
      if (!entry.hasStore || !entry.store) {
        router.replace("/store/onboarding/owner");
        return;
      }
      if (!entry.store.onboardingCompleted && entry.store.status !== "rejected") {
        router.replace(`/store/onboarding/${entry.store.onboardingStep || "owner"}`);
        return;
      }
      if (entry.store.isApproved) {
        router.replace("/store/dashboard");
        return;
      }
      setStore(entry.store);
    } catch (loadError) {
      console.error("Unable to load store application status:", loadError);
      setError("We could not load your application status. Your application has not been changed.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    return onSnapshot(doc(db, "storeWorkspaceStatuses", user.uid), (snapshot) => {
      if (!snapshot.exists()) return;
      const status = snapshot.data();
      const lifecycleStatus = ["draft", "pending_review", "approved", "rejected", "suspended"]
        .includes(status.status) ? status.status as StoreLifecycle["status"] : null;
      if (status.isApproved === true) {
        router.replace("/store/dashboard");
        return;
      }
      if (status.onboardingCompleted !== true && status.status !== "rejected") {
        router.replace(`/store/onboarding/${typeof status.onboardingStep === "string" ? status.onboardingStep : "owner"}`);
        return;
      }
      setStore((current) => current ? {
        ...current,
        isApproved: false,
        isActive: status.isActive === true,
        onboardingCompleted: status.onboardingCompleted === true,
        onboardingStep: typeof status.onboardingStep === "string" ? status.onboardingStep : current.onboardingStep,
        status: lifecycleStatus ?? current.status,
        rejectionReason: Object.hasOwn(status, "rejectionReason")
          ? typeof status.rejectionReason === "string" ? status.rejectionReason : null
          : current.rejectionReason,
        suspensionReason: Object.hasOwn(status, "suspensionReason")
          ? typeof status.suspensionReason === "string" ? status.suspensionReason : null
          : current.suspensionReason,
        approvalRevoked: Object.hasOwn(status, "approvalRevoked")
          ? status.approvalRevoked === true
          : current.approvalRevoked,
      } : current);
    }, (listenerError) => {
      console.error("Unable to listen for store approval updates:", listenerError);
      setError("Live approval updates are temporarily unavailable. Select Retry to refresh your status.");
    });
  }, [router]);

  const presentation = useMemo(() => {
    if (store?.status === "rejected") return {
      icon: AlertTriangle,
      iconClass: "bg-red-100 text-red-600",
      eyebrow: "Application decision",
      title: "Changes are required",
      message: "LIA could not approve this version of your application. Review the reason below, correct the application, and submit it again.",
      reason: store.rejectionReason,
    };
    if (store?.status === "suspended") return {
      icon: ShieldAlert,
      iconClass: "bg-red-100 text-red-600",
      eyebrow: "Store access suspended",
      title: "Your workspace is unavailable",
      message: "LIA has suspended this store. Contact LIA Support if you need clarification or believe this needs review.",
      reason: store.suspensionReason,
    };
    if (store?.approvalRevoked) return {
      icon: RefreshCw,
      iconClass: "bg-amber-100 text-amber-700",
      eyebrow: "Approval removed",
      title: "Your store is under review",
      message: "Store access and customer visibility have been turned off. An administrator must approve the store again before access returns.",
      reason: null,
    };
    if (store?.isApproved) return {
      icon: CheckCircle2,
      iconClass: "bg-green-100 text-green-700",
      eyebrow: "Application approved",
      title: "Your store is ready",
      message: "Opening your store dashboard now.",
      reason: null,
    };
    return {
      icon: Clock3,
      iconClass: "bg-amber-100 text-amber-600",
      eyebrow: "Store onboarding submitted",
      title: "Waiting for approval",
      message: "The LIA team is reviewing your store. Once approved, you can access the dashboard and prepare your catalog. Customer visibility remains a separate activation step.",
      reason: null,
    };
  }, [store]);

  const reopenApplication = async () => {
    setReopening(true);
    setError("");
    try {
      const result = await storeWorkspaceClientService.reopenRejectedApplication();
      router.replace(`/store/onboarding/${result.onboardingStep || "owner"}`);
    } catch (reopenError) {
      console.error("Unable to reopen rejected store application:", reopenError);
      setError(reopenError instanceof Error ? reopenError.message : "The application could not be reopened.");
      setReopening(false);
    }
  };

  const signOut = async () => {
    await customerLogoutService.logout();
    router.replace("/login");
  };

  if (loading && !store) return <BrandedLoader message="Loading application status" />;

  const StatusIcon = presentation.icon;
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 via-white to-green-50 p-5">
      <section className="w-full max-w-lg rounded-2xl bg-white p-7 text-center shadow-xl sm:p-8">
        <div className={`mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full ${presentation.iconClass}`}>
          <StatusIcon className="h-8 w-8" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">{presentation.eyebrow}</p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">{presentation.title}</h1>
        <p className="mt-4 text-sm leading-6 text-gray-600">{presentation.message}</p>
        {presentation.reason && (
          <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-4 text-left">
            <p className="text-xs font-bold uppercase tracking-wide text-red-700">Reason from LIA</p>
            <p className="mt-1 text-sm leading-6 text-red-800">{presentation.reason}</p>
          </div>
        )}
        {error && <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          {store?.status === "rejected" && (
            <button type="button" disabled={reopening} onClick={() => void reopenApplication()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
              <FilePenLine className="h-4 w-4" /> {reopening ? "Opening…" : "Correct and resubmit"}
            </button>
          )}
          <button type="button" onClick={() => void loadStatus()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh status
          </button>
          <button type="button" onClick={() => void signOut()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </section>
    </main>
  );
}

export default function PendingApprovalPage() {
  return <RoleGuard allowedAccountTypes={["store_owner"]}><PendingApprovalContent /></RoleGuard>;
}

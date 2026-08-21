"use client";

import {useEffect, useState} from "react";
import {Clock3, LogOut, RefreshCw, ShieldAlert, ShieldCheck} from "lucide-react";
import {doc, onSnapshot} from "firebase/firestore";
import {useRouter} from "next/navigation";
import {RoleGuard} from "@/components/auth/RoleGuard";
import {auth, db} from "@/lib/firebase";
import {accountLogoutService} from "@/services/auth/customerLogoutService";
import {driverWorkspaceClientService} from "@/services/driver/driverWorkspaceClientService";

type DriverState = {status: "pending_review" | "rejected" | "suspended"; reason: string | null};

function DriverPendingApprovalContent() {
  const router = useRouter();
  const [state, setState] = useState<DriverState>({status: "pending_review", reason: null});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    void driverWorkspaceClientService.getEntry().then((entry) => {
      if (entry.isApproved) router.replace("/driver/dashboard");
      else if (["pending_review", "rejected", "suspended"].includes(entry.status)) {
        setState({status: entry.status as DriverState["status"], reason: entry.reason});
      }
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load your application status."));

    return onSnapshot(doc(db, "driverWorkspaceStatuses", user.uid), (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      if (data.isApproved === true && data.status === "approved") {
        router.replace("/driver/dashboard");
        return;
      }
      const status = ["rejected", "suspended"].includes(data.status) ? data.status : "pending_review";
      const reason = status === "suspended" ? data.suspension?.reason : data.applicationReview?.reason;
      setState((current) => ({
        status,
        reason: typeof reason === "string"
          ? reason
          : current.status === status ? current.reason : null,
      }));
    }, (reason) => setError(reason.message));
  }, [router]);

  const reopen = async () => {
    try {
      setBusy(true); setError("");
      const result = await driverWorkspaceClientService.reopenRejectedApplication();
      router.replace(`/driver/onboarding/${result.onboardingStep}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to reopen the application.");
    } finally { setBusy(false); }
  };

  const suspended = state.status === "suspended";
  const rejected = state.status === "rejected";
  const Icon = suspended || rejected ? ShieldAlert : Clock3;
  const title = suspended ? "Driver access suspended" : rejected ? "Application needs corrections" : "Application under review";
  const description = suspended
    ? "You cannot accept LIA deliveries while this suspension is active. Contact LIA Support if you need help."
    : rejected
      ? "Review the administrator's reason, correct your information, and submit the application again."
      : "Your application, documents, and payout setup are being reviewed. This page updates automatically after a decision.";

  return <main className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-green-50 px-4 py-12"><section className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center rounded-3xl bg-white p-8 text-center shadow-xl"><div className={`mb-6 flex h-16 w-16 items-center justify-center rounded-full ${suspended || rejected ? "bg-red-100" : "bg-orange-100"}`}><Icon className={`h-8 w-8 ${suspended || rejected ? "text-red-600" : "text-orange-600"}`} /></div><h1 className="text-2xl font-bold text-gray-900">{title}</h1><p className="mt-3 text-sm leading-6 text-gray-600">{description}</p>{state.reason && <div className="mt-5 w-full rounded-2xl border border-red-100 bg-red-50 p-4 text-left"><p className="text-xs font-bold uppercase tracking-wide text-red-700">Administrator message</p><p className="mt-2 text-sm text-red-900">{state.reason}</p></div>}{!rejected && !suspended && <div className="mt-6 flex items-start gap-3 rounded-2xl bg-green-50 p-4 text-left text-sm text-green-900"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-700" /><span>You will enter the dashboard automatically when approval is complete.</span></div>}{error && <p className="mt-4 w-full rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="mt-7 flex flex-wrap justify-center gap-3">{rejected && <button disabled={busy} type="button" onClick={() => void reopen()} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"><RefreshCw className="h-4 w-4" />Correct and resubmit</button>}<button type="button" onClick={async () => {await accountLogoutService.logout(); router.replace("/login");}} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700"><LogOut className="h-4 w-4" />Back to login</button></div></section></main>;
}

export default function DriverPendingApprovalPage() {
  return <RoleGuard allowedAccountTypes={["driver"]}><DriverPendingApprovalContent /></RoleGuard>;
}

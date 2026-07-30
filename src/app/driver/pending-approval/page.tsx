"use client";

/*
|--------------------------------------------------------------------------
| Driver Pending Approval Page
|--------------------------------------------------------------------------
|
| A driver reaches this page only after completing the application and
| Stripe submission. An administrator must set drivers/{uid}.isApproved to
| true before the driver workspace becomes available.
|
*/

import {
  Clock3,
  LogOut,
  ShieldCheck,
} from "lucide-react";

import {
  useRouter,
} from "next/navigation";

import {
  RoleGuard,
} from "@/components/auth/RoleGuard";
import {
  auth,
} from "@/lib/firebase";

function DriverPendingApprovalContent() {
  const router = useRouter();

  const signOut = async () => {
    await auth.signOut();
    router.replace("/login");
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-green-50 px-4 py-12">
      <section className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col items-center justify-center rounded-3xl bg-white p-8 text-center shadow-xl">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100"><Clock3 className="h-8 w-8 text-orange-600" /></div>
        <h1 className="text-2xl font-bold text-gray-900">Application under review</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">Your driver application and payout setup were submitted to LIA. We will review your information before activating your driver account.</p>
        <div className="mt-6 flex items-start gap-3 rounded-2xl bg-green-50 p-4 text-left text-sm text-green-900"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-700" /><span>Once approved, you can return here to access the driver workspace.</span></div>
        <button
          type="button"
          onClick={signOut}
          className="mt-7 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 hover:shadow-md"
        >
          <LogOut className="h-4 w-4" />
          Back to login
        </button>
      </section>
    </main>
  );
}

export default function DriverPendingApprovalPage() {
  return <RoleGuard allowedAccountTypes={["driver"]}><DriverPendingApprovalContent /></RoleGuard>;
}

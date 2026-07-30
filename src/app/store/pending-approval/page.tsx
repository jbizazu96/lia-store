"use client";

/*
  Store approval waiting page.

  An onboarding submission stays here until an administrator sets
  `isApproved` to true. Activation is a separate customer-visibility step.
*/
import { Clock3, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { RoleGuard } from "@/components/auth/RoleGuard";

function PendingApprovalContent() {
  const router = useRouter();

  const signOut = async () => {
    await auth.signOut();
    router.replace("/login");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 via-white to-green-50 p-5">
      <section className="w-full max-w-lg rounded-3xl bg-white p-8 text-center shadow-xl">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
          <Clock3 className="h-10 w-10 text-amber-600" />
        </div>
        <p className="text-sm font-semibold uppercase tracking-wide text-orange-600">
          Store onboarding submitted
        </p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">
          Waiting for approval
        </h1>
        <p className="mt-4 text-sm leading-6 text-gray-600">
          The LIA team is reviewing your store. Once it is approved, you can
          access your dashboard and start adding products. Customers will only
          see your store after LIA activates it.
        </p>
        <button
          type="button"
          onClick={signOut}
          className="mt-7 inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </section>
    </main>
  );
}

export default function PendingApprovalPage() {
  return (
    <RoleGuard allowedAccountTypes={["store_owner"]}>
      <PendingApprovalContent />
    </RoleGuard>
  );
}

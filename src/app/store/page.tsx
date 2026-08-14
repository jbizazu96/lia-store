"use client";

/*
  React hooks.
*/
import {useCallback, useEffect, useState} from "react";
import {useRouter} from "next/navigation";

/*
  Firebase imports.
*/
import {auth} from "@/lib/firebase";
import {
  storeWorkspaceClientService,
} from "@/services/store/storeWorkspaceClientService";
import { BrandedLoader } from "@/components/ui/BrandedLoader";
import {
  RoleGuard,
} from "@/components/auth/RoleGuard";
import {AlertTriangle, RefreshCw} from "lucide-react";

function StorePageContent() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const checkStore = useCallback(async () => {
      setLoading(true);
      setError("");
      const user = auth.currentUser;

      if (!user) {
        router.push("/login");
        return;
      }

      try {
        const entry =
          await storeWorkspaceClientService.getEntry(true);

        if (entry.hasStore && entry.store) {
          const storeData = entry.store;
          
          if (storeData.onboardingCompleted === true) {
            const isApproved = storeData.isApproved === true;

            router.replace(
              isApproved
                ? "/store/dashboard"
                : "/store/pending-approval"
            );
          } else {
            router.replace(`/store/onboarding/${storeData.onboardingStep || "owner"}`);
          }
        } else {
          router.replace("/store/onboarding/owner");
        }
      } catch (error) {
        console.error("Error checking store:", error);
        setError("We could not load your store workspace. Your store information has not been changed.");
        setLoading(false);
      }
  }, [router]);

  useEffect(() => {
    void checkStore();
  }, [checkStore]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-5">
        <section className="w-full max-w-md rounded-2xl border border-red-100 bg-white p-7 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-10 w-10 text-red-500" />
          <h1 className="mt-4 text-xl font-bold text-gray-900">Store workspace unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-gray-600">{error}</p>
          <button type="button" onClick={() => void checkStore()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white">
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </section>
      </main>
    );
  }

  return loading ? (
    <BrandedLoader message="Loading Store" />
  ) : null;
}

export default function StorePage() {
  return (
    <RoleGuard
      allowedAccountTypes={[
        "store_owner",
      ]}
    >
      <StorePageContent />
    </RoleGuard>
  );
}

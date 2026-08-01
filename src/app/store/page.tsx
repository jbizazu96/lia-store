"use client";

/*
  React hooks.
*/
import {useEffect} from "react";
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

function StorePageContent() {
  const router = useRouter();

  useEffect(() => {
    async function checkStore() {
      const user = auth.currentUser;

      if (!user) {
        router.push("/login");
        return;
      }

      try {
        const entry =
          await storeWorkspaceClientService
            .getEntry();

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
        router.push("/store/onboarding/owner");
      }
    }

    checkStore();
  }, [router]);

  return (
    <BrandedLoader message="Loading Store" />
  );
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

"use client";

/*
  React hooks.
*/
import {useEffect} from "react";
import {useRouter} from "next/navigation";

/*
  Firebase imports.
*/
import {auth, db} from "@/lib/firebase";
import {collection, query, where, getDocs} from "firebase/firestore";
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
        /*
          Check if store exists for this user.
        */
        const storesRef = collection(db, "stores");
        const q = query(storesRef, where("ownerId", "==", user.uid));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          const storeData = snapshot.docs[0].data();
          
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

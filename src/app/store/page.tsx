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
          
          // If store is active, go to dashboard
          if (storeData.status === "active") {
            router.replace("/store/dashboard");
          } else {
            // Store is pending or other status
            router.replace("/store/dashboard");
          }
        } else {
          // No store - redirect to create page
          router.replace("/store/create");
        }
      } catch (error) {
        console.error("Error checking store:", error);
        router.push("/store/create");
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

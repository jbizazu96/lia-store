"use client";

/*
|--------------------------------------------------------------------------
| Driver Placeholder
|--------------------------------------------------------------------------
|
| Driver registration is available now. The driver workspace will be added
| later, so this protected page prevents driver accounts from entering the
| customer or store experience in the meantime.
|
*/

import { useEffect } from "react";
import {
  useRouter,
} from "next/navigation";
import {
  BrandedLoader,
} from "@/components/ui/BrandedLoader";
import {
  driverWorkspaceClientService,
} from "@/services/driver/driverWorkspaceClientService";

function DriverPageContent() {
  const router = useRouter();

  useEffect(() => {
    driverWorkspaceClientService.getEntry()
      .then((entry) => {
        if (!entry.hasApplication || !entry.onboardingCompleted) {
          router.replace(`/driver/onboarding/${entry.onboardingStep}`);
        } else if (!entry.isApproved) {
          router.replace("/driver/pending-approval");
        } else {
          router.replace("/driver/dashboard");
        }
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  return <BrandedLoader message="Opening driver dashboard" />;
}

export default function DriverPage() {
  return <DriverPageContent />;
}

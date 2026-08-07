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

import { useEffect, useState } from "react";
import {
  useRouter,
} from "next/navigation";
import {
  BrandedLoader,
} from "@/components/ui/BrandedLoader";
import {
  driverWorkspaceClientService,
  DriverWorkspaceClientError,
} from "@/services/driver/driverWorkspaceClientService";

function DriverPageContent() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    driverWorkspaceClientService.getEntry()
      .then((entry) => {
        if (!entry.hasApplication || !entry.onboardingCompleted) {
          router.replace(`/driver/onboarding/${entry.onboardingStep}`);
        } else if (entry.status === "suspended") {
          /*
           * A suspended driver may view their status and account documents,
           * but cannot be used for delivery because suspension revokes
           * isApproved on the protected driver record.
           */
          router.replace("/driver/dashboard");
        } else if (!entry.isApproved) {
          router.replace("/driver/pending-approval");
        } else {
          router.replace("/driver/dashboard");
        }
      })
      .catch((reason: unknown) => {
        /*
         * Only an invalid session or a role denial belongs on the login
         * screen. Do not make a healthy signed-in driver appear logged out
         * when Vercel, Firebase Admin, or another server dependency fails.
         */
        if (
          reason instanceof DriverWorkspaceClientError &&
          (reason.status === 401 || reason.status === 403)
        ) {
          router.replace("/login");
          return;
        }

        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to open the driver workspace."
        );
      });
  }, [router]);

  if (error) {
    return <main className="mx-auto flex min-h-screen max-w-lg items-center p-6"><section className="w-full rounded-2xl border border-red-100 bg-white p-6 shadow-sm"><h1 className="text-xl font-bold text-slate-900">Unable to open the driver app</h1><p className="mt-2 text-sm text-slate-600">{error}</p><button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white">Try again</button></section></main>;
  }

  return <BrandedLoader message="Opening driver dashboard" />;
}

export default function DriverPage() {
  return <DriverPageContent />;
}

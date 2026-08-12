"use client";

/*
|--------------------------------------------------------------------------
| Admin Guard
|--------------------------------------------------------------------------
|
| Route grouping is not authorization. This guard waits for Firebase Auth,
| then asks the protected admin callable to verify admins/{uid} and the
| verified email before rendering the Admin workspace.
|
*/

import {
  useEffect,
  useState,
} from "react";
import {
  useRouter,
} from "next/navigation";
import {
  BrandedLoader,
} from "@/components/ui/BrandedLoader";
import {
  useAuth,
} from "@/context/AuthContext";
import {
  adminWorkspaceClientService,
  AdminWorkspaceClientError,
} from "@/services/admin/adminWorkspaceClientService";
import {AdminAccessProvider} from "@/context/AdminAccessContext";
import type {AdminAccessProfile} from "@/types/adminAccess";

export function AdminGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const {user, loading} = useAuth();
  const [administrator, setAdministrator] = useState<AdminAccessProfile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    if (loading) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    queueMicrotask(() => {
      if (active) {
        setAdministrator(null);
        setError("");
      }
    });

    void adminWorkspaceClientService
      .getEntry()
      .then((entry) => {
        if (active) setAdministrator(entry.administrator);
      })
      .catch((reason: unknown) => {
        if (!active) return;

        if (
          reason instanceof AdminWorkspaceClientError &&
          reason.status === 403
        ) {
          router.replace("/login");
          return;
        }

        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to verify administrator access."
        );
      });

    return () => {
      active = false;
    };
  }, [loading, router, user]);

  if (loading || !administrator) {
    if (error) {
      return (
        <main className="flex min-h-screen items-center justify-center p-6">
          <section className="w-full max-w-md rounded-2xl border border-red-100 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">
              Unable to open Admin
            </h1>
            <p className="mt-2 text-sm text-slate-600">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white"
            >
              Try again
            </button>
          </section>
        </main>
      );
    }

    return <BrandedLoader message="Verifying administrator access" />;
  }

  return <AdminAccessProvider administrator={administrator}>{children}</AdminAccessProvider>;
}

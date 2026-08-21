"use client";

/*
|--------------------------------------------------------------------------
| Role Guard
|--------------------------------------------------------------------------
|
| Routes are protected by the account type stored in the user's Firestore
| profile. Route groups only organize URLs; they do not enforce access.
|
*/

import {
  useEffect,
  useState,
} from "react";

import {
  AlertTriangle,
  LogIn,
  RefreshCw,
} from "lucide-react";

import {
  useRouter,
} from "next/navigation";

import {
  useAuth,
} from "@/context/AuthContext";

import {
  BrandedLoader,
} from "@/components/ui/BrandedLoader";
import {
  currentAccountClientService,
} from "@/services/user/currentAccountClientService";
import {customerStartupClientService} from "@/services/user/customerStartupClientService";
import {startCustomerPerformanceTrace} from "@/services/performance/customerPerformanceService";
import {customerLogoutService} from "@/services/auth/customerLogoutService";

export type AccountType =
  | "customer"
  | "store_owner"
  | "driver"
  | "admin";

interface RoleGuardProps {
  allowedAccountTypes: AccountType[];
  children: React.ReactNode;
}

function getAccountHome(
  accountType: AccountType
): string {
  switch (accountType) {
    case "store_owner":
      return "/store/dashboard";
    case "admin":
      return "/admin";
    case "driver":
      return "/driver";
    default:
      return "/home";
  }
}

export function RoleGuard({
  allowedAccountTypes,
  children,
}: RoleGuardProps) {
  const router =
    useRouter();

  const {
    user,
    loading: authLoading,
  } = useAuth();

  /*
    Parents commonly provide this prop as an inline array, for example:
    allowedAccountTypes={["store_owner"]}. A new array is created whenever a
    form field changes, so use a stable value based on the actual roles rather
    than the array reference in the access-verification effect.
  */
  const allowedAccountTypesSignature =
    allowedAccountTypes.join("|");

  const [
    accessVerified,
    setAccessVerified,
  ] = useState(false);

  const [
    accessError,
    setAccessError,
  ] = useState<string | null>(null);

  const [
    verificationAttempt,
    setVerificationAttempt,
  ] = useState(0);

  const [
    leavingSession,
    setLeavingSession,
  ] = useState(false);

  const returnToLogin = async () => {
    if (leavingSession) return;

    setLeavingSession(true);
    try {
      await customerLogoutService.logout();
    } catch (error) {
      // A broken or expired session must never trap the user on this screen.
      console.error("Unable to cleanly end the inaccessible session:", error);
    } finally {
      window.location.assign("/login");
    }
  };

  useEffect(() => {
    let active = true;

    if (authLoading) {
      return;
    }

    if (!user) {
      router.replace("/login");
      return;
    }

    // Reset the visible guard while a new identity or route is verified.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAccessVerified(false);
    setAccessError(null);

    const verifyAccess = async () => {
      const accessTrace = startCustomerPerformanceTrace("customer_access_ready");
      try {
        const customerOnly = allowedAccountTypesSignature === "customer";
        const {accountType} = customerOnly
          ? await customerStartupClientService.get()
          : await currentAccountClientService.get();

        if (
          !accountType ||
          !allowedAccountTypesSignature
            .split("|")
            .includes(
            accountType
          )
        ) {
          accessTrace.stop({status: "redirected", account_type: accountType});
          router.replace(
            getAccountHome(accountType)
          );
          return;
        }

        if (active) {
          setAccessVerified(true);
        }
        accessTrace.stop({status: "success", account_type: accountType});
      } catch (error) {
        accessTrace.stop({status: "error"});
        console.error(
          "Unable to verify route access:",
          error
        );

        if (active) {
          setAccessError(
            error instanceof Error ? error.message :
              "We could not verify your account access. Please sign in again."
          );
        }
      }
    };

    void verifyAccess();

    return () => {
      active = false;
    };
  }, [
    allowedAccountTypesSignature,
    authLoading,
    router,
    user,
    verificationAttempt,
  ]);

  if (authLoading || !accessVerified) {
    if (accessError) {
      return (
        <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-5 py-8 text-center text-slate-900">
          <section
            role="alert"
            className="w-full max-w-sm rounded-2xl border border-orange-100 bg-white p-6 shadow-lg shadow-slate-200/60"
          >
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-600">
              <AlertTriangle className="h-6 w-6" />
            </span>
            <h1 className="mt-4 text-xl font-black">Account access unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {accessError}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Your session may have expired or your account access may have
              changed. Retry once, or return to sign in with an authorized
              account.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={leavingSession}
                onClick={() => {
                  setAccessError(null);
                  setVerificationAttempt((current) => current + 1);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
              <button
                type="button"
                disabled={leavingSession}
                onClick={() => void returnToLogin()}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-orange-600 px-4 py-3 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50"
              >
                <LogIn className="h-4 w-4" />
                {leavingSession ? "Signing out…" : "Back to login"}
              </button>
            </div>
          </section>
        </main>
      );
    }

    return (
      <BrandedLoader
        message="Verifying account access"
      />
    );
  }

  return <>{children}</>;
}

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
      try {
        const { accountType } =
          await currentAccountClientService.get();

        if (
          !accountType ||
          !allowedAccountTypesSignature
            .split("|")
            .includes(
            accountType
          )
        ) {
          router.replace(
            getAccountHome(accountType)
          );
          return;
        }

        if (active) {
          setAccessVerified(true);
        }
      } catch (error) {
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
  ]);

  if (authLoading || !accessVerified) {
    if (accessError) {
      return (
        <main className="flex min-h-screen items-center justify-center px-6 text-center">
          <p className="max-w-sm text-sm text-gray-600">
            {accessError}
          </p>
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

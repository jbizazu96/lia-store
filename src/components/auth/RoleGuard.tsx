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
  doc,
  getDoc,
} from "firebase/firestore";

import {
  db,
} from "@/lib/firebase";

import {
  useAuth,
} from "@/context/AuthContext";

import {
  BrandedLoader,
} from "@/components/ui/BrandedLoader";

export type AccountType =
  | "customer"
  | "store_owner"
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

    setAccessVerified(false);
    setAccessError(null);

    const verifyAccess = async () => {
      try {
        const userSnapshot =
          await getDoc(
            doc(
              db,
              "users",
              user.uid
            )
          );

        if (!userSnapshot.exists()) {
          throw new Error(
            "Your account profile could not be found."
          );
        }

        const accountType =
          userSnapshot.data()
            .accountType as AccountType | undefined;

        if (
          !accountType ||
          !allowedAccountTypes.includes(
            accountType
          )
        ) {
          router.replace(
            getAccountHome(
              accountType ?? "customer"
            )
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
    allowedAccountTypes,
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

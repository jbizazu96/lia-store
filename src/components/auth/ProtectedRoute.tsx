"use client";

/*
  This component protects pages that require login.

  Use it by wrapping page content:

  <ProtectedRoute>
    <YourPageContent />
  </ProtectedRoute>
*/

/*
  Next.js navigation.

  useRouter lets us redirect users from
  one page to another inside client components.
*/
import { useRouter } from "next/navigation";

/*
  React hooks.

  useEffect runs after render, which is the
  right time to redirect a logged-out user.
*/
import { useEffect } from "react";

/*
  Our authentication context.

  AuthContext listens to Firebase Auth once
  and shares the current user across the app.
*/
import { useAuth } from "@/context/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({
  children,
}: ProtectedRouteProps) {
  const router = useRouter();

  /*
    user:
    The logged-in Firebase user, or null.

    loading:
    True while Firebase is checking whether
    a session already exists in the browser.
  */
  const { user, loading } = useAuth();

  useEffect(() => {
    /*
      Only redirect after Firebase is done checking.

      Without the loading check, a page refresh could
      briefly see user as null and redirect too early.
    */
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <main className="p-10">
        Loading...
      </main>
    );
  }

  /*
    The redirect has started, so we render nothing
    instead of flashing protected dashboard content.
  */
  if (!user) {
    return null;
  }

  return <>{children}</>;
}

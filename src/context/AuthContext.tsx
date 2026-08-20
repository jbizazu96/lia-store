/* This file has a purpose to keep track of current user, loading state, login state throughout the app */


"use client";

/*
  React imports.

  createContext:
  Creates a global state container.

  useContext:
  Lets us access that global state from any component.

  useEffect:
  Runs code when component loads.

  useState:
  Stores values that can change over time.
*/
import { createContext, useContext, useEffect, useState } from "react";

/*
  Firebase Auth imports.

  User:
  TypeScript type representing a logged-in user.

  onAuthStateChanged:
  Firebase listener that automatically fires when:

  - user logs in
  - user logs out
  - page refreshes
*/
import { User, onAuthStateChanged } from "firebase/auth";

/*
  Import our Firebase Auth instance
  from the firebase configuration file.
*/
import { auth } from "@/lib/firebase";
import { firebaseMessaging } from "@/services/notification/firebaseMessaging";
import {customerLogoutService} from "@/services/auth/customerLogoutService";
import {
  clearClientDataCache,
} from "@/services/cache/clientDataCache";
import {startCustomerPerformanceTrace} from "@/services/performance/customerPerformanceService";
/*
  This interface describes what data
  our AuthContext will provide.

  Any component using useAuth()
  will receive:

  user
  loading
*/
interface AuthContextType {
  user: User | null;
  loading: boolean;
}

/*
  Create the actual context.

  These are default values.

  They are replaced later by the
  values inside AuthProvider.
*/
const AuthContext =
  createContext<AuthContextType>({
    user: null,
    loading: true,
  });

/*
  AuthProvider wraps our entire app.

  Every page inside this provider
  gains access to:

  user
  loading
*/
export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  /*
    Store the currently logged-in user.

    Initially:
    null

    After Firebase responds:
    actual user object
  */
  const [user, setUser] =
    useState<User | null>(null);

  /*
    Loading starts as true.

    Why?

    Because Firebase needs a moment
    to determine if someone is logged in.
  */
  const [loading, setLoading] =
    useState(true);

  /*
    Runs once when component mounts.
  */
  useEffect(() => {
    const authTrace = startCustomerPerformanceTrace("customer_auth_ready");
    const removeSessionCleanup = customerLogoutService.installSessionCleanup();
    /*
      Listen for authentication changes.

      Firebase automatically calls this
      whenever login status changes.
    */
    const unsubscribe =
      onAuthStateChanged(
        auth,
        (firebaseUser) => {
          /*
            firebaseUser can be:

            - User object
            - null
          */
          setUser(firebaseUser);
          setLoading(false);
          authTrace.stop({status: firebaseUser ? "authenticated" : "signed_out"});

            /* Never retain an account's in-memory view models after logout. */
            if (!firebaseUser) {
              clearClientDataCache();
            }

            if (firebaseUser) {
              /* Push setup is optional background work. It must never keep
               * authentication, role verification, or the first page behind
               * a loading screen. */
              void (async () => {
                try {
               /*
                * Do not show the permission prompt at login. Existing opt-in
                * devices are silently refreshed; new users choose from
                * Customer Profile > Notifications.
                */
               await firebaseMessaging.initialize();
               await firebaseMessaging.registerDevice({
                 requestPermission: false,
               });

                } catch (error) {

                console.error(
                  "Unable to register device for notifications:",
                  error
                );

                }
              })();

            }
        }
      );

    /*
      Cleanup function.

      Prevents memory leaks by removing
      the Firebase listener when component
      unmounts.
    */
    return () => {
      removeSessionCleanup();
      unsubscribe();
    };
  }, []);

  /*
    Make user + loading available
    to every component wrapped by
    AuthProvider.
  */
  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/*
  Custom hook.

  Instead of:

  const auth = useContext(AuthContext)

  We can simply do:

  const { user } = useAuth()
*/
export function useAuth() {
  return useContext(AuthContext);
}

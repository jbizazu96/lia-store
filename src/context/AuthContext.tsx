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

          /*
            Firebase has finished checking.

            We can stop loading.
          */
          setLoading(false);
        }
      );

    /*
      Cleanup function.

      Prevents memory leaks by removing
      the Firebase listener when component
      unmounts.
    */
    return unsubscribe;
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

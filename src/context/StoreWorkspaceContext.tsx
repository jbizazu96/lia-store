"use client";
/* eslint-disable react-hooks/set-state-in-effect -- auth transitions intentionally reset owner-scoped workspace state */
/* eslint-disable react-hooks/exhaustive-deps -- the status listener is keyed by store ID and uses functional state updates for current fields */

import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import {doc, onSnapshot} from "firebase/firestore";
import {useAuth} from "@/context/AuthContext";
import {db} from "@/lib/firebase";
import {storeWorkspaceClientService, type StoreWorkspaceEntry} from "@/services/store/storeWorkspaceClientService";

interface StoreWorkspaceContextValue {
  entry: StoreWorkspaceEntry | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const StoreWorkspaceContext = createContext<StoreWorkspaceContextValue | null>(null);

function workspaceEntriesMatch(
  current: StoreWorkspaceEntry | null,
  next: StoreWorkspaceEntry,
): boolean {
  if (!current) return false;
  return JSON.stringify(current) === JSON.stringify(next);
}

export function StoreWorkspaceProvider({children}: {children: React.ReactNode}) {
  const {user, loading: authLoading} = useAuth();
  const [entry, setEntry] = useState<StoreWorkspaceEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastRefreshAt = useRef(0);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const next = await storeWorkspaceClientService.getEntry(true);
      // A foreground refresh should not invalidate every workspace consumer
      // when the server returned the same data. Keeping the existing object
      // prevents product and order pages from replaying their entrance/loading
      // states merely because the browser tab became active again.
      setEntry((current) => workspaceEntriesMatch(current, next) ? current : next);
      lastRefreshAt.current = Date.now();
      setError(null);
    } catch (loadError) {
      console.error("Unable to load the store workspace:", loadError);
      setError("The store workspace could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setEntry(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh();
  }, [authLoading, refresh, user]);

  useEffect(() => {
    if (!user || !entry?.store) return;
    return onSnapshot(doc(db, "storeWorkspaceStatuses", entry.access.ownerId), (snapshot) => {
      if (!snapshot.exists()) return;
      const status = snapshot.data();
      const lifecycleStatus = ["draft", "pending_review", "approved", "rejected", "suspended"]
        .includes(status.status) ? status.status as NonNullable<StoreWorkspaceEntry["store"]>["status"] : null;
      setEntry((current) => current?.store ? {
        ...current,
        store: {
          ...current.store,
          isApproved: status.isApproved === true,
          isActive: status.isActive === true,
          onboardingCompleted: status.onboardingCompleted === true,
          onboardingStep: typeof status.onboardingStep === "string" ? status.onboardingStep : current.store.onboardingStep,
          status: lifecycleStatus ?? current.store.status,
          rejectionReason: Object.hasOwn(status, "rejectionReason")
            ? typeof status.rejectionReason === "string" ? status.rejectionReason : null
            : current.store.rejectionReason,
          suspensionReason: Object.hasOwn(status, "suspensionReason")
            ? typeof status.suspensionReason === "string" ? status.suspensionReason : null
            : current.store.suspensionReason,
          approvalRevoked: Object.hasOwn(status, "approvalRevoked")
            ? status.approvalRevoked === true
            : current.store.approvalRevoked,
        },
      } : current);
    }, (listenerError) => console.error("Unable to listen to store workspace status:", listenerError));
  }, [entry?.store?.id, user]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRefreshAt.current >= 30_000) {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refresh]);

  const value = useMemo(() => ({entry, loading, error, refresh}), [entry, error, loading, refresh]);
  return <StoreWorkspaceContext.Provider value={value}>{children}</StoreWorkspaceContext.Provider>;
}

export function useStoreWorkspace() {
  const value = useContext(StoreWorkspaceContext);
  if (!value) throw new Error("useStoreWorkspace must be used inside StoreWorkspaceProvider.");
  return value;
}

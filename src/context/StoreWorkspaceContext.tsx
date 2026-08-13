"use client";

import {createContext, useCallback, useContext, useEffect, useMemo, useState} from "react";
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

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const next = await storeWorkspaceClientService.getEntry(true);
      // A foreground refresh should not invalidate every workspace consumer
      // when the server returned the same data. Keeping the existing object
      // prevents product and order pages from replaying their entrance/loading
      // states merely because the browser tab became active again.
      setEntry((current) => workspaceEntriesMatch(current, next) ? current : next);
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
    return onSnapshot(doc(db, "storeWorkspaceStatuses", user.uid), (snapshot) => {
      if (!snapshot.exists()) return;
      const status = snapshot.data();
      setEntry((current) => current?.store ? {
        ...current,
        store: {...current.store, isApproved: status.isApproved === true, isActive: status.isActive === true},
      } : current);
    }, (listenerError) => console.error("Unable to listen to store workspace status:", listenerError));
  }, [entry?.store?.id, user]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
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

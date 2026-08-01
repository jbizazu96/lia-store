"use client";

/*
|--------------------------------------------------------------------------
| useStoreDashboard Hook
|--------------------------------------------------------------------------
|
| Dashboard data is an authenticated callable aggregate. It avoids loading a
| private store document and every order in the browser whenever one order
| changes.
|
*/

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  onAuthStateChanged,
} from "firebase/auth";
import {
  auth,
} from "@/lib/firebase";
import {
  storeWorkspaceClientService,
} from "@/services/store/storeWorkspaceClientService";
import type {
  DashboardData,
} from "@/types/dashboard";

interface UseStoreDashboardResult {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  needsStoreSetup: boolean;
  refreshDashboard: () => Promise<void>;
}

export function useStoreDashboard(): UseStoreDashboardResult {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [needsStoreSetup, setNeedsStoreSetup] = useState(false);

  const loadDashboard = useCallback(async (showLoading = true): Promise<void> => {
    if (showLoading) setLoading(true);

    try {
      const entry = await storeWorkspaceClientService.getEntry();
      if (!entry.hasStore || !entry.store) {
        setData(null);
        setNeedsStoreSetup(true);
        setError("No store was found for this account.");
        return;
      }

      const dashboard = await storeWorkspaceClientService.getDashboard();
      setData(dashboard);
      setNeedsStoreSetup(false);
      setError(null);
    } catch (loadError) {
      console.error("Error loading store dashboard:", loadError);
      setData(null);
      setError("Failed to load dashboard.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setData(null);
        setIsAuthenticated(false);
        setNeedsStoreSetup(false);
        setError("You must sign in.");
        setLoading(false);
        return;
      }

      setIsAuthenticated(true);
      void loadDashboard();
      refreshTimer = setInterval(() => void loadDashboard(false), 60_000);
    });

    return () => {
      unsubscribe();
      if (refreshTimer) clearInterval(refreshTimer);
    };
  }, [loadDashboard]);

  return {
    data,
    loading,
    error,
    isAuthenticated,
    needsStoreSetup,
    refreshDashboard: () => loadDashboard(false),
  };
}

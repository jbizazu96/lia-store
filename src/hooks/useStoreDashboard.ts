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
  useRef,
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
import {startStorePerformanceTrace} from "@/services/performance/storePerformanceService";

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
  const lastRefreshAt = useRef(0);

  const loadDashboard = useCallback(async (showLoading = true): Promise<void> => {
    const trace = startStorePerformanceTrace("store_dashboard_ready");
    let traceResult = "complete";
    if (showLoading) setLoading(true);

    try {
      /* Both callables independently verify the owner, so start them together. */
      const [entryResult, dashboardResult] = await Promise.allSettled([
        storeWorkspaceClientService.getEntry(),
        storeWorkspaceClientService.getDashboard(!showLoading),
      ]);

      if (entryResult.status === "rejected") {
        throw entryResult.reason;
      }

      const entry = entryResult.value;
      if (!entry.hasStore || !entry.store) {
        setData(null);
        setNeedsStoreSetup(true);
        setError("No store was found for this account.");
        return;
      }

      if (dashboardResult.status === "rejected") {
        throw dashboardResult.reason;
      }

      setData(dashboardResult.value);
      lastRefreshAt.current = Date.now();
      setNeedsStoreSetup(false);
      setError(null);
    } catch (loadError) {
      traceResult = "error";
      console.error("Error loading store dashboard:", loadError);
      setData(null);
      setError("Failed to load dashboard.");
    } finally {
      trace.stop({result: traceResult, background: String(!showLoading)});
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
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
    });

    const refreshWhenUseful = () => {
      if (!auth.currentUser || document.visibilityState !== "visible") return;
      if (Date.now() - lastRefreshAt.current < 30_000) return;
      void loadDashboard(false);
    };
    document.addEventListener("visibilitychange", refreshWhenUseful);
    window.addEventListener("lia:store-orders-changed", refreshWhenUseful);

    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", refreshWhenUseful);
      window.removeEventListener("lia:store-orders-changed", refreshWhenUseful);
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

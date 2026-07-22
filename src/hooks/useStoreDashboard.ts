"use client";

/*
|--------------------------------------------------------------------------
| useStoreDashboard Hook
|--------------------------------------------------------------------------
|
| Connects dashboardService to the store dashboard page.
|
| Responsibilities:
|
| - Wait for Firebase Authentication.
| - Resolve the signed-in user's store.
| - Load dashboard data.
| - Expose loading, error, authentication, and refresh state.
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
  dashboardService,
} from "@/services/dashboard/dashboardService";

import {
  userService,
} from "@/services/user/userService";

import type {
  DashboardData,
} from "@/types/dashboard";

/*
|--------------------------------------------------------------------------
| Hook Result
|--------------------------------------------------------------------------
*/

interface UseStoreDashboardResult {
  data: DashboardData | null;

  loading: boolean;

  error: string | null;

  isAuthenticated: boolean;

  needsStoreSetup: boolean;

  refreshDashboard: () => Promise<void>;
}

/*
|--------------------------------------------------------------------------
| Hook
|--------------------------------------------------------------------------
*/

export function useStoreDashboard():
UseStoreDashboardResult {
  const [
    data,
    setData,
  ] = useState<DashboardData | null>(
    null
  );

  const [
    storeId,
    setStoreId,
  ] = useState<string | null>(
    null
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null
  );

  const [
    isAuthenticated,
    setIsAuthenticated,
  ] = useState(false);

  const [
    needsStoreSetup,
    setNeedsStoreSetup,
  ] = useState(false);

  /*
  |--------------------------------------------------------------------------
  | Load Dashboard
  |--------------------------------------------------------------------------
  */

  const loadDashboard =
    useCallback(
      async (
        resolvedStoreId: string,
        showLoading = true
      ): Promise<void> => {
        if (showLoading) {
          setLoading(true);
        }

        try {
          setError(null);

          const dashboardData =
            await dashboardService
              .getStoreDashboard(
                resolvedStoreId
              );

          if (!dashboardData) {
            setData(null);

            setError(
              "Dashboard data could not be loaded."
            );

            return;
          }

          setData(
            dashboardData
          );
        } catch (loadError) {
          console.error(
            "Error loading store dashboard:",
            loadError
          );

          setData(null);

          setError(
            "Failed to load dashboard."
          );
        } finally {
          if (showLoading) {
            setLoading(false);
          }
        }
      },
      []
    );

  /*
  |--------------------------------------------------------------------------
  | Authentication And Store Resolution
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (user) => {
          if (!user) {
            setData(null);
            setStoreId(null);
            setIsAuthenticated(false);
            setNeedsStoreSetup(false);
            setError(
              "You must sign in."
            );
            setLoading(false);

            return;
          }

          setIsAuthenticated(true);
          setNeedsStoreSetup(false);
          setLoading(true);
          setError(null);

          try {
            const resolvedStoreId =
              await userService.getStoreId(
                user.uid
              );

            if (!resolvedStoreId) {
              setData(null);
              setStoreId(null);
              setNeedsStoreSetup(true);

              setError(
                "No store was found for this account."
              );

              setLoading(false);

              return;
            }

            setStoreId(
              resolvedStoreId
            );

            await loadDashboard(
              resolvedStoreId
            );
          } catch (loadError) {
            console.error(
              "Error preparing dashboard:",
              loadError
            );

            setData(null);
            setStoreId(null);

            setError(
              "Failed to load dashboard."
            );

            setLoading(false);
          }
        }
      );

    return unsubscribe;
  }, [
    loadDashboard,
  ]);

  /*
  |--------------------------------------------------------------------------
  | Manual Refresh
  |--------------------------------------------------------------------------
  */

  const refreshDashboard =
    useCallback(
      async (): Promise<void> => {
        if (!storeId) {
          return;
        }

        await loadDashboard(
          storeId,
          false
        );
      },
      [
        loadDashboard,
        storeId,
      ]
    );

  return {
    data,
    loading,
    error,
    isAuthenticated,
    needsStoreSetup,
    refreshDashboard,
  };
}
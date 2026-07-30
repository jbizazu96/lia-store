"use client";

/*
|--------------------------------------------------------------------------
| Driver Onboarding Hook
|--------------------------------------------------------------------------
|
| Loads only the authenticated driver's private draft and exposes a refresh
| method for use after each saved step.
|
*/

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  useAuth,
} from "@/context/AuthContext";
import {
  driverOnboardingService,
} from "@/services/driver/driverOnboardingService";
import type {
  DriverOnboardingDraft,
} from "@/types/driverOnboarding";

export function useDriverOnboarding() {
  const { user, loading: authLoading } = useAuth();
  const [draft, setDraft] = useState<DriverOnboardingDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      setDraft(await driverOnboardingService.getDraft(user.uid));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load driver onboarding.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setDraft(null);
      setLoading(false);
      return;
    }

    void refresh();
  }, [authLoading, refresh, user]);

  return {
    user,
    draft,
    loading: authLoading || loading,
    error,
    refresh,
  };
}

"use client";
/* eslint-disable react-hooks/set-state-in-effect -- auth transitions intentionally initialize or clear the owner draft */

/*
  Store Onboarding Hook.

  Loads the signed-in store owner's onboarding draft and exposes a
  refresh function after each successful onboarding step.
*/
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { storeOnboardingService } from "@/services/store/storeOnboardingService";
import type { StoreOnboardingDraft } from "@/types/storeOnboarding";

export function useStoreOnboarding() {
  const { user, loading: authLoading } = useAuth();
  const [draft, setDraft] = useState<StoreOnboardingDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => { if (!user) return; setLoading(true); try { setDraft(await storeOnboardingService.getDraft(user.uid)); setError(null); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load onboarding."); } finally { setLoading(false); } }, [user]);
  useEffect(() => { if (authLoading) return; if (!user) { setDraft(null); setLoading(false); return; } void refresh(); }, [authLoading, refresh, user]);
  return { user, draft, loading: authLoading || loading, error, refresh };
}

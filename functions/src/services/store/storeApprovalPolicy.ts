export interface StoreApprovalState {
  onboardingCompleted?: unknown;
  isApproved?: unknown;
}

export function hasApprovedStoreWorkspace(state: StoreApprovalState): boolean {
  return state.onboardingCompleted === true && state.isApproved === true;
}

export function canEditStoreApplication(state: StoreApprovalState): boolean {
  return state.onboardingCompleted !== true;
}

export function canAccessStoreStripe(
  state: StoreApprovalState,
  context: "onboarding" | "settings",
): boolean {
  return (context === "onboarding" && canEditStoreApplication(state)) ||
    hasApprovedStoreWorkspace(state);
}

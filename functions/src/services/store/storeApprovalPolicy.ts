export interface StoreApprovalState {
  onboardingCompleted?: unknown;
  isApproved?: unknown;
  stripeIsReady?: unknown;
  stripeTransfersEnabled?: unknown;
  stripeConnectApiVersion?: unknown;
  stripeAccountId?: unknown;
}

export function hasApprovedStoreWorkspace(state: StoreApprovalState): boolean {
  return state.onboardingCompleted === true && state.isApproved === true;
}

export function canEditStoreApplication(state: StoreApprovalState): boolean {
  return state.onboardingCompleted !== true;
}

export function isStoreReadyForActivation(state: StoreApprovalState): boolean {
  return state.onboardingCompleted === true &&
    state.isApproved === true &&
    state.stripeIsReady === true &&
    state.stripeTransfersEnabled === true &&
    state.stripeConnectApiVersion === "v2" &&
    typeof state.stripeAccountId === "string" &&
    state.stripeAccountId.trim().length > 0;
}

export function canAccessStoreStripe(
  state: StoreApprovalState,
  context: "onboarding" | "settings",
): boolean {
  return (context === "onboarding" && canEditStoreApplication(state)) ||
    hasApprovedStoreWorkspace(state);
}

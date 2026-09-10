import type {StoreWorkspaceEntry} from "@/services/store/storeWorkspaceClientService";

const onboardingSteps = new Set([
  "owner",
  "store-information",
  "business-information",
  "schedule",
  "agreement",
  "stripe",
]);

function safeOnboardingStep(value: string): string {
  return onboardingSteps.has(value) ? value : "owner";
}

/**
 * Select the store destination from the authoritative store lifecycle.
 * Merely creating a store draft (including preparing an image upload) never
 * means that the application was submitted for review.
 */
export function getStoreEntryDestination(entry: StoreWorkspaceEntry): string {
  if (!entry.hasStore || !entry.store) return "/store/onboarding/owner";

  if (entry.store.onboardingCompleted !== true) {
    return `/store/onboarding/${safeOnboardingStep(entry.store.onboardingStep)}`;
  }

  if (entry.store.isApproved !== true) return "/store/pending-approval";

  if (entry.access.role === "staff") {
    return entry.access.permissions.orders
      ? "/store/store-orders"
      : "/store/products";
  }

  return "/store/dashboard";
}

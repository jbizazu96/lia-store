import { StoreOnboardingStep } from "@/components/store/onboarding/StoreOnboardingStep";

/*
  Store Owner Onboarding Page.

  Collects the owner identity and address details before a store owner
  can continue to the store-information step.
*/
export default function StoreOwnerOnboardingPage() {
  return <StoreOnboardingStep step="owner" />;
}

import { StoreOnboardingStep } from "@/components/store/onboarding/StoreOnboardingStep";

/**
 * Records the authenticated merchant representative's electronic acceptance
 * before any Stripe payout account can be created.
 */
export default function StoreAgreementOnboardingPage() {
  return <StoreOnboardingStep step="agreement" />;
}

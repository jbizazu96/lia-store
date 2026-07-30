import { StoreOnboardingStep } from "@/components/store/onboarding/StoreOnboardingStep";

/*
  Stripe Onboarding Page.

  Starts or resumes Stripe-hosted payout onboarding. Stripe account
  updates continue to be synchronized by the Stripe webhook.
*/
export default function StripeOnboardingPage() {
  return <StoreOnboardingStep step="stripe" />;
}

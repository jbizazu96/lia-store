import { StoreOnboardingStep } from "@/components/store/onboarding/StoreOnboardingStep";

/*
  Store Schedule Onboarding Page.

  Captures the opening days and hours that will later control the
  customer-facing store availability.
*/
export default function StoreScheduleOnboardingPage() {
  return <StoreOnboardingStep step="schedule" />;
}

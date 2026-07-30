import { StoreOnboardingStep } from "@/components/store/onboarding/StoreOnboardingStep";

/*
  Store Information Onboarding Page.

  Collects the public store details customers will see, including the
  store logo and optional banner.
*/
export default function StoreInformationOnboardingPage() {
  return <StoreOnboardingStep step="store-information" />;
}

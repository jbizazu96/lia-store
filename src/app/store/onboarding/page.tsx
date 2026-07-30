import { redirect } from "next/navigation";

/*
  Store Onboarding Entry Page.

  The owner-information step creates the store's pending onboarding
  document, so every new onboarding session starts there.
*/
export default function StoreOnboardingIndexPage() {
  redirect("/store/onboarding/owner");
}

import { redirect } from "next/navigation";

/*
  Driver Onboarding Entry Page.

  The first usable driver onboarding route is personal information. Keeping
  this redirect makes /driver/onboarding a safe route for future links.
*/
export default function DriverOnboardingPage() {
  redirect("/driver/onboarding/personal-information");
}

import {describe, expect, it} from "vitest";
import {
  canAccessStoreStripe,
  canEditStoreApplication,
  hasApprovedStoreWorkspace,
} from "../../functions/src/services/store/storeApprovalPolicy";

describe("store approval enforcement", () => {
  it("grants workspace access only after completed admin approval", () => {
    expect(hasApprovedStoreWorkspace({onboardingCompleted: true, isApproved: true})).toBe(true);
    expect(hasApprovedStoreWorkspace({onboardingCompleted: true, isApproved: false})).toBe(false);
    expect(hasApprovedStoreWorkspace({onboardingCompleted: false, isApproved: true})).toBe(false);
  });

  it("locks application edits after submission", () => {
    expect(canEditStoreApplication({onboardingCompleted: false})).toBe(true);
    expect(canEditStoreApplication({onboardingCompleted: true, isApproved: false})).toBe(false);
    expect(canEditStoreApplication({onboardingCompleted: true, isApproved: true})).toBe(false);
  });

  it("allows Stripe during unfinished onboarding and after approval only", () => {
    expect(canAccessStoreStripe({onboardingCompleted: false, isApproved: false}, "onboarding")).toBe(true);
    expect(canAccessStoreStripe({onboardingCompleted: true, isApproved: false}, "onboarding")).toBe(false);
    expect(canAccessStoreStripe({onboardingCompleted: true, isApproved: false}, "settings")).toBe(false);
    expect(canAccessStoreStripe({onboardingCompleted: true, isApproved: true}, "settings")).toBe(true);
  });
});

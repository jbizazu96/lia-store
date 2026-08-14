import {describe, expect, it} from "vitest";
import {
  canAccessStoreStripe,
  canEditStoreApplication,
  hasApprovedStoreWorkspace,
  isStoreReadyForActivation,
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

  it("activates only an approved, completed store with ready Stripe transfers", () => {
    const ready = {
      onboardingCompleted: true,
      isApproved: true,
      stripeIsReady: true,
      stripeTransfersEnabled: true,
      stripeConnectApiVersion: "v2",
      stripeAccountId: "acct_store",
    };
    expect(isStoreReadyForActivation(ready)).toBe(true);
    expect(isStoreReadyForActivation({...ready, stripeIsReady: false})).toBe(false);
    expect(isStoreReadyForActivation({...ready, stripeTransfersEnabled: false})).toBe(false);
    expect(isStoreReadyForActivation({...ready, stripeConnectApiVersion: "v1"})).toBe(false);
    expect(isStoreReadyForActivation({...ready, stripeAccountId: ""})).toBe(false);
    expect(isStoreReadyForActivation({...ready, isApproved: false})).toBe(false);
  });
});

import {describe, expect, it} from "vitest";
import {getStoreEntryDestination} from "../../src/services/store/storeEntryNavigation";
import type {StoreWorkspaceEntry} from "../../src/services/store/storeWorkspaceClientService";

function entry(overrides: Partial<NonNullable<StoreWorkspaceEntry["store"]>> = {}): StoreWorkspaceEntry {
  return {
    hasStore: true,
    store: {
      id: "store-1",
      name: "Test Store",
      logoUrl: "",
      isApproved: false,
      isActive: false,
      onboardingCompleted: false,
      onboardingStep: "owner",
      status: "draft",
      rejectionReason: null,
      suspensionReason: null,
      approvalRevoked: false,
      ...overrides,
    },
    pendingOrderCount: 0,
    access: {
      uid: "owner-1",
      ownerId: "owner-1",
      storeId: "store-1",
      role: "owner",
      permissions: {orders: "write", products: "write"},
    },
  };
}

describe("store entry navigation", () => {
  it("keeps a newly created upload draft in onboarding", () => {
    expect(getStoreEntryDestination(entry())).toBe("/store/onboarding/owner");
  });

  it("resumes the last saved onboarding step", () => {
    expect(getStoreEntryDestination(entry({onboardingStep: "business-information"})))
      .toBe("/store/onboarding/business-information");
  });

  it("shows approval status only after final submission", () => {
    expect(getStoreEntryDestination(entry({
      onboardingCompleted: true,
      onboardingStep: "stripe",
      status: "pending_review",
    }))).toBe("/store/pending-approval");
  });

  it("opens an approved owner workspace", () => {
    expect(getStoreEntryDestination(entry({
      onboardingCompleted: true,
      isApproved: true,
      status: "approved",
    }))).toBe("/store/dashboard");
  });

  it("falls back safely when an invalid draft step is stored", () => {
    expect(getStoreEntryDestination(entry({onboardingStep: "unknown"})))
      .toBe("/store/onboarding/owner");
  });
});

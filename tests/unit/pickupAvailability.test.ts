import {describe, expect, it} from "vitest";
import {isPickupLocationAllowed} from "../../src/services/pricing/pickupAvailability";

const policy = {pickupMaximumDistanceMiles: 40};

describe("pickup location availability", () => {
  it("allows an approved zone without applying the distance threshold", () => {
    expect(isPickupLocationAllowed(policy, true, 125)).toBe(true);
  });

  it("allows an out-of-zone store at the configured threshold", () => {
    expect(isPickupLocationAllowed(policy, false, 40)).toBe(true);
  });

  it("blocks an out-of-zone store beyond the configured threshold", () => {
    expect(isPickupLocationAllowed(policy, false, 40.01)).toBe(false);
  });

  it("does not authorize out-of-zone pickup before distance is known", () => {
    expect(isPickupLocationAllowed(policy, false, null)).toBe(false);
  });
});

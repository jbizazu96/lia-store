import {describe, expect, it} from "vitest";
import {
  isPickupAllowedByZoneOrDistance,
  resolvePickupZoneDecision,
  resolveZonePricingDecision,
} from "../../functions/src/payment/pricing/zonePricingResolutionService";

describe("zone pricing resolution", () => {
  it("uses the shared home zone", () => {
    expect(resolveZonePricingDecision(
      {homeZoneId: "iowa-city"},
      {homeZoneId: "iowa-city"},
    )).toMatchObject({allowed: true, pricingZoneId: "iowa-city", zoneAccessType: "same_home_zone"});
  });

  it("uses customer home-zone pricing when the store serves that zone", () => {
    expect(resolveZonePricingDecision(
      {homeZoneId: "iowa-city"},
      {homeZoneId: "cedar-rapids", serviceZoneIds: ["iowa-city"]},
    )).toMatchObject({allowed: true, pricingZoneId: "iowa-city", zoneAccessType: "store_service_zone"});
  });

  it("uses store-zone pricing for an approved customer Order Zone", () => {
    expect(resolveZonePricingDecision(
      {homeZoneId: "iowa-city", orderZoneIds: ["cedar-rapids"]},
      {homeZoneId: "cedar-rapids"},
    )).toMatchObject({allowed: true, pricingZoneId: "cedar-rapids", zoneAccessType: "customer_order_zone"});
  });

  it("blocks an assigned cross-zone pair without an exception", () => {
    expect(resolveZonePricingDecision(
      {homeZoneId: "iowa-city"},
      {homeZoneId: "cedar-rapids"},
    )).toMatchObject({allowed: false, pricingZoneId: null, zoneAccessType: "default_pricing"});
  });

  it("falls back to default pricing when either account is not assigned", () => {
    expect(resolveZonePricingDecision({}, {homeZoneId: "cedar-rapids"}))
      .toMatchObject({allowed: true, pricingZoneId: null, zoneAccessType: "default_pricing"});
  });
});

describe("pickup zone resolution", () => {
  it("allows pickup anywhere inside the shared home zone", () => {
    expect(resolvePickupZoneDecision(
      {homeZoneId: "iowa-city"},
      {homeZoneId: "iowa-city"},
    )).toMatchObject({allowed: true, zoneAccessType: "same_home_zone"});
  });

  it("allows pickup from an administrator-approved customer Order Zone", () => {
    expect(resolvePickupZoneDecision(
      {homeZoneId: "iowa-city", orderZoneIds: ["cedar-rapids"]},
      {homeZoneId: "cedar-rapids"},
    )).toMatchObject({allowed: true, zoneAccessType: "customer_order_zone"});
  });

  it("does not use a store service zone to authorize pickup", () => {
    expect(resolvePickupZoneDecision(
      {homeZoneId: "iowa-city"},
      {homeZoneId: "cedar-rapids", serviceZoneIds: ["iowa-city"]},
    )).toMatchObject({allowed: false});
  });

  it("blocks pickup when either home zone is unassigned", () => {
    expect(resolvePickupZoneDecision({}, {homeZoneId: "cedar-rapids"}))
      .toMatchObject({allowed: false});
  });

  it("allows an out-of-zone pickup within the admin distance threshold", () => {
    const decision = resolvePickupZoneDecision(
      {homeZoneId: "iowa-city"},
      {homeZoneId: "des-moines"},
    );
    expect(isPickupAllowedByZoneOrDistance(decision, 35, 40)).toBe(true);
    expect(isPickupAllowedByZoneOrDistance(decision, 40.01, 40)).toBe(false);
  });

  it("does not apply the pickup threshold to an approved zone", () => {
    const decision = resolvePickupZoneDecision(
      {homeZoneId: "iowa-city"},
      {homeZoneId: "iowa-city"},
    );
    expect(isPickupAllowedByZoneOrDistance(decision, 125, 40)).toBe(true);
  });
});

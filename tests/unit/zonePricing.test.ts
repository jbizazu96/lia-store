import {describe, expect, it} from "vitest";
import {resolveZonePricingDecision} from "../../functions/src/payment/pricing/zonePricingResolutionService";

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

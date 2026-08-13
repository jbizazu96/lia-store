import {describe, expect, it} from "vitest";
import {hasStoreAddressChanged} from "../../functions/src/services/store/storeSettingsPolicy";

describe("store settings address policy", () => {
  it("ignores case and surrounding whitespace", () => {
    expect(hasStoreAddressChanged(
      {address: "100 Main St", city: "Iowa City", state: "IA", zip: "52240"},
      {address: " 100 MAIN ST ", city: "IOWA CITY", state: "ia", zip: "52240"},
    )).toBe(false);
  });

  it("detects each material address component", () => {
    const existing = {address: "100 MAIN ST", city: "IOWA CITY", state: "IA", zip: "52240"};
    expect(hasStoreAddressChanged(existing, {...existing, address: "101 MAIN ST"})).toBe(true);
    expect(hasStoreAddressChanged(existing, {...existing, city: "CORALVILLE"})).toBe(true);
    expect(hasStoreAddressChanged(existing, {...existing, state: "IL"})).toBe(true);
    expect(hasStoreAddressChanged(existing, {...existing, zip: "52241"})).toBe(true);
  });
});

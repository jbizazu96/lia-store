import {describe, expect, it} from "vitest";
import {isConfiguredLowStock, normalizeStoreSku, retailInventoryValue} from "../../functions/src/services/store/storeInventoryPolicy";

describe("store inventory policy", () => {
  it("normalizes SKU identity case-insensitively", () => expect(normalizeStoreSku(" mag-001 ")).toBe("MAG-001"));
  it("keeps retail value synchronized with whole stock units", () => expect(retailInventoryValue(4.99, 3.9)).toBeCloseTo(14.97));
  it("uses the product threshold without treating zero stock as merely low", () => {
    expect(isConfiguredLowStock(5, 5)).toBe(true);
    expect(isConfiguredLowStock(6, 5)).toBe(false);
    expect(isConfiguredLowStock(0, 5)).toBe(false);
  });
});

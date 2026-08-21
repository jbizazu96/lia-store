import {describe, expect, it} from "vitest";
import {isAllowedStoreOrderTransition} from "../../functions/src/orders/orderStatusTransitions";

describe("store-controlled order transitions", () => {
  it.each([
    ["pending", "accepted"],
    ["accepted", "preparing"],
    ["preparing", "ready_for_pickup"],
  ] as const)("allows %s to move to %s", (current, next) => {
    expect(isAllowedStoreOrderTransition(current, next)).toBe(true);
  });

  it.each([
    ["pending", "preparing"],
    ["accepted", "ready_for_pickup"],
    ["ready_for_pickup", "preparing"],
    ["out_for_delivery", "ready_for_pickup"],
    ["completed", "cancelled"],
    ["cancelled", "accepted"],
  ] as const)("rejects %s to %s", (current, next) => {
    expect(isAllowedStoreOrderTransition(current, next)).toBe(false);
  });

  it("allows a store to cancel only before accepting", () => {
    expect(isAllowedStoreOrderTransition("pending", "cancelled")).toBe(true);
  });

  it.each(["accepted", "preparing", "ready_for_pickup", "out_for_delivery"] as const)(
    "requires LIA Support after the order reaches %s",
    (current) => {
      expect(isAllowedStoreOrderTransition(current, "cancelled")).toBe(false);
    },
  );
});

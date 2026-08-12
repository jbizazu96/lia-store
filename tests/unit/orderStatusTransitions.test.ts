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

  it.each(["pending", "accepted", "preparing", "ready_for_pickup"] as const)(
    "allows cancellation before delivery from %s",
    (current) => {
      expect(isAllowedStoreOrderTransition(current, "cancelled")).toBe(true);
    },
  );
});

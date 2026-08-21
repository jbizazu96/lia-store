import {describe, expect, it} from "vitest";
import {isDriverPayoutReady} from "../../functions/src/admin/driverApprovalReadiness";

const ready = {stripeAccountId: "acct_driver", stripeConnectApiVersion: "v2", stripeDetailsSubmitted: true, stripeTransfersEnabled: true, stripePayoutsEnabled: true, stripeRequiresAction: false};

describe("driver payout approval readiness", () => {
  it("accepts a fully payout-ready Stripe v2 driver", () => expect(isDriverPayoutReady(ready)).toBe(true));
  it.each([["stripeAccountId", ""], ["stripeConnectApiVersion", "v1"], ["stripeDetailsSubmitted", false], ["stripeTransfersEnabled", false], ["stripePayoutsEnabled", false], ["stripeRequiresAction", true]])("rejects an unsafe %s value", (field, value) => {
    expect(isDriverPayoutReady({...ready, [field]: value})).toBe(false);
  });
});

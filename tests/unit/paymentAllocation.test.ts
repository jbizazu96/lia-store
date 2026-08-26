import {describe, expect, it} from "vitest";
import {calculatePaymentAllocation} from "../../functions/src/payment/marketplace/paymentAllocationService";

const baseInput = {
  storeCommissionBasisPoints: 1_000,
  driverCommissionBasisPoints: 3_000,
  driverMinimumPayCents: 0,
  freeDeliveryMinimumCents: 10_000,
  freeDeliveryDriverIncentiveWithoutTipCents: 500,
  freeDeliveryDriverIncentiveWithTipCents: 300,
  merchandiseSubtotal: 10_000,
  salesTax: 700,
  deliveryFee: 1_100,
  driverTip: 500,
  serviceFee: 400,
};

describe("marketplace payment allocation", () => {
  it("pays the store after commission plus all sales tax", () => {
    const result = calculatePaymentAllocation(baseInput);
    expect(result.store).toMatchObject({commissionAmount: 1_000, netMerchandise: 9_000, salesTax: 700, transferAmount: 9_700});
  });

  it("pays the driver 70% of delivery and 100% of the tip", () => {
    const result = calculatePaymentAllocation(baseInput);
    expect(result.driver).toMatchObject({commissionAmount: 330, netDeliveryFee: 770, driverTip: 500, transferAmount: 1_270});
  });

  it("keeps the complete payment balanced", () => {
    const result = calculatePaymentAllocation(baseInput);
    const customerTotal = 10_000 + 700 + 1_100 + 500 + 400;
    expect(result.store.transferAmount + result.driver.transferAmount + result.platform.totalRevenue)
      .toBe(customerTotal);
  });

  it("funds the configured driver incentive on free delivery", () => {
    const result = calculatePaymentAllocation({...baseInput, deliveryFee: 0, driverTip: 0});
    expect(result.driver.freeDeliveryIncentive).toBe(500);
    expect(result.driver.transferAmount).toBe(500);
    expect(result.platform.freeDeliveryIncentiveCost).toBe(500);
  });

  it("guarantees minimum driver pay before tips and reduces LIA commission", () => {
    const result = calculatePaymentAllocation({
      ...baseInput,
      deliveryFee: 599,
      driverTip: 300,
      driverMinimumPayCents: 599,
    });
    expect(result.driver).toMatchObject({
      commissionAmount: 0,
      netDeliveryFee: 599,
      driverTip: 300,
      minimumPayAdjustment: 180,
      transferAmount: 899,
    });
    expect(result.platform.driverCommission).toBe(0);
  });

  it("takes the configured commission after driver pay exceeds the minimum", () => {
    const result = calculatePaymentAllocation({
      ...baseInput,
      deliveryFee: 1_100,
      driverMinimumPayCents: 599,
    });
    expect(result.driver).toMatchObject({
      commissionAmount: 330,
      netDeliveryFee: 770,
      minimumPayAdjustment: 0,
    });
  });

  it("creates no driver obligation for customer pickup", () => {
    const result = calculatePaymentAllocation({
      ...baseInput,
      fulfillmentType: "pickup",
      deliveryFee: 0,
      driverTip: 0,
      driverMinimumPayCents: 599,
    });
    expect(result.driver).toMatchObject({
      commissionAmount: 0,
      netDeliveryFee: 0,
      driverTip: 0,
      freeDeliveryIncentive: 0,
      transferAmount: 0,
    });
    expect(result.platform.driverCommission).toBe(0);
  });
});

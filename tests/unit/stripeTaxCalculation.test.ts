import {describe, expect, it} from "vitest";
import type Stripe from "stripe";

import {createStripeTaxCalculation} from "../../functions/src/payment/tax/stripeTaxCalculationService";
import {calculatePaymentPricing} from "../../functions/src/payment/pricing/paymentPricingCalculator";
import type {MarketplacePricingPolicy} from "../../functions/src/payment/pricing/marketplacePricingPolicy";
import type {TrustedCheckoutItem, TrustedCheckoutStore} from "../../functions/src/payment/checkout/checkoutPaymentTypes";

const policy = {
  maxRadiusMiles: 25, baseDeliveryFeeCents: 500, baseDistanceMiles: 3,
  costPerMileCents: 0, peakSurchargeEnabled: false, peakSurchargeCents: 0,
  freeDeliveryMinimumCents: 100_000, defaultMinimumOrderCents: 0,
  pickupEnabled: true, pickupMaximumDistanceMiles: 30, pickupMinimumOrderCents: 0,
  pickupPreparationMinutes: 30, pickupServiceFeeRate: 0.1,
  pickupMinimumServiceFeeCents: 0, pickupMaximumServiceFeeCents: 10_000,
  serviceFeeRate: 0.1, minimumServiceFeeCents: 0, maximumServiceFeeCents: 10_000,
  driverMinimumPayCents: 0,
  freeDeliveryDriverIncentiveWithoutTipCents: 0,
  freeDeliveryDriverIncentiveWithTipCents: 0,
} satisfies MarketplacePricingPolicy;

const item: TrustedCheckoutItem = {
  productId: "product-1", storeId: "store-1", name: "Milk",
  unitPriceAmount: 1_000, quantity: 1, lineTotalAmount: 1_000,
  taxCategoryId: "grocery-food", stripeTaxCode: "txcd_40060003",
};
const exemptItem: TrustedCheckoutItem = {
  productId: "product-2", storeId: "store-1", name: "Exempt food",
  unitPriceAmount: 500, quantity: 1, lineTotalAmount: 500,
  taxCategoryId: "exempt-food", stripeTaxCode: "txcd_00000000",
};

const store: TrustedCheckoutStore = {
  id: "store-1", ownerId: "owner-1", name: "Local Market",
  address: "100 Main St", city: "Iowa City", state: "IA", zip: "52240", country: "US",
  phone: "3195550100", latitude: 41.66, longitude: -91.53,
  homeZoneId: "zone-1", serviceZoneIds: [], pickupEnabled: true,
  pickupPreparationMinutes: 30, pickupInstructions: null,
  stripeAccountId: "acct_store", stripeTransfersEnabled: true, stripeIsReady: true,
};

describe("Stripe Tax checkout calculation", () => {
  it("sends product-level codes and delivery/store addresses and snapshots item tax", async () => {
    const pricingBeforeTax = calculatePaymentPricing({
      policy, fulfillmentType: "delivery", subtotalAmount: 1_500,
      distanceMiles: 2, tipAmount: 200, authoritativeTaxAmount: 0,
    });
    let request: Record<string, unknown> | undefined;
    const stripe = {
      tax: {calculations: {create: async (input: Record<string, unknown>) => {
        request = input;
        return {
          id: "taxcalc_test", amount_total: 2_362, currency: "usd",
          expires_at: 1_800_000_000, livemode: false, tax_date: 1_700_000_000,
          tax_amount_exclusive: 12, tax_amount_inclusive: 0, tax_breakdown: [],
          line_items: {data: [
            {reference: "product:product-1", amount: 1_000, amount_tax: 5,
              quantity: 1, tax_behavior: "exclusive", tax_code: "txcd_40060003", tax_breakdown: []},
            {reference: "product:product-2", amount: 500, amount_tax: 0,
              quantity: 1, tax_behavior: "exclusive", tax_code: "txcd_00000000", tax_breakdown: []},
            {reference: "service_fee", amount: 150, amount_tax: 7,
              quantity: 1, tax_behavior: "exclusive", tax_code: "txcd_20030000", tax_breakdown: []},
            {reference: "tip", amount: 200, amount_tax: 0,
              quantity: 1, tax_behavior: "exclusive", tax_code: "txcd_90020001", tax_breakdown: []},
          ]},
          shipping_cost: {amount: 500, amount_tax: 0, tax_behavior: "exclusive",
            tax_code: "txcd_92010001", tax_breakdown: []},
        };
      }}},
    } as unknown as Stripe;

    const result = await createStripeTaxCalculation(stripe, {
      fulfillmentType: "delivery", items: [item, exemptItem], store,
      deliveryAddress: {street: "200 Oak St", city: "Coralville", state: "IA", zip: "52241"},
      pricingBeforeTax,
    });

    expect(request?.line_items).toEqual(expect.arrayContaining([
      expect.objectContaining({reference: "product:product-1", tax_code: "txcd_40060003"}),
      expect.objectContaining({reference: "tip", tax_code: "txcd_90020001"}),
    ]));
    expect(request?.customer_details).toEqual(expect.objectContaining({
      address: expect.objectContaining({city: "Coralville", postal_code: "52241"}),
    }));
    expect(request?.ship_from_details).toEqual({address: expect.objectContaining({city: "Iowa City"})});
    expect(result.taxAmount).toBe(12);
    expect(result.productTaxById.get("product-1")).toMatchObject({
      taxCategoryId: "grocery-food", stripeTaxCode: "txcd_40060003", taxAmount: 5,
    });
    expect(result.productTaxById.get("product-2")).toMatchObject({
      stripeTaxCode: "txcd_00000000", taxAmount: 0,
    });
  });

  it("uses the store address and preserves zero tax for exempt pickup items", async () => {
    const pricingBeforeTax = calculatePaymentPricing({
      policy, fulfillmentType: "pickup", subtotalAmount: 500,
      distanceMiles: 0, tipAmount: 0, authoritativeTaxAmount: 0,
    });
    let request: Record<string, unknown> | undefined;
    const stripe = {tax: {calculations: {create: async (input: Record<string, unknown>) => {
      request = input;
      return {
        id: "taxcalc_pickup", amount_total: 550, currency: "usd",
        expires_at: null, livemode: false, tax_date: 1_700_000_000,
        tax_amount_exclusive: 0, tax_amount_inclusive: 0, tax_breakdown: [],
        line_items: {has_more: false, data: [
          {reference: "product:product-2", amount: 500, amount_tax: 0, quantity: 1,
            tax_behavior: "exclusive", tax_code: "txcd_00000000", tax_breakdown: []},
          {reference: "service_fee", amount: 50, amount_tax: 0, quantity: 1,
            tax_behavior: "exclusive", tax_code: "txcd_20030000", tax_breakdown: []},
        ]},
        shipping_cost: null,
      };
    }}}} as unknown as Stripe;

    const result = await createStripeTaxCalculation(stripe, {
      fulfillmentType: "pickup", items: [exemptItem], store, pricingBeforeTax,
    });
    expect(request?.customer_details).toEqual(expect.objectContaining({
      address: expect.objectContaining({line1: "100 Main St", city: "Iowa City"}),
    }));
    expect(request?.shipping_cost).toBeUndefined();
    expect(result).toMatchObject({taxAmount: 0, amountTotal: 550});
  });

  it("lets an authoritative Stripe amount replace the legacy Admin percentage", () => {
    const result = calculatePaymentPricing({
      policy, fulfillmentType: "pickup", subtotalAmount: 1_000,
      distanceMiles: 0, tipAmount: 0, authoritativeTaxAmount: 37,
    });
    expect(result.taxAmount).toBe(37);
    expect(result.totalAmount).toBe(1_137);
  });
});

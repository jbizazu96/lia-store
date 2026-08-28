import Stripe from "stripe";

import type {
  CheckoutPaymentAddressInput,
  TrustedCheckoutItem,
  TrustedCheckoutStore,
} from "../checkout/checkoutPaymentTypes";
import type {PaymentPricingResult} from "../pricing/paymentPricingCalculator";

type StripeTaxPricingInput = Pick<
  PaymentPricingResult,
  "deliveryFeeAmount" | "serviceFeeAmount" | "tipAmount" | "totalAmount"
>;

const SERVICE_FEE_TAX_CODE = "txcd_20030000";
const OPTIONAL_GRATUITY_TAX_CODE = "txcd_90020001";
const SHIPPING_TAX_CODE = "txcd_92010001";

export type StripeTaxLineType =
  | "product"
  | "service_fee"
  | "tip"
  | "delivery_fee";

export interface StripeTaxAddressSnapshot {
  line1: string;
  city: string;
  state: string;
  postalCode: string;
  country: "US";
}

export interface StripeTaxBreakdownSnapshot {
  amount: number;
  taxableAmount: number;
  taxabilityReason: string;
  sourcing: string | null;
  jurisdiction: {
    country: string;
    state: string | null;
    level: string;
    displayName: string;
  } | null;
  rate: {
    displayName: string;
    percentage: string;
    taxType: string;
  } | null;
}

export interface StripeTaxLineSnapshot {
  reference: string;
  type: StripeTaxLineType;
  productId: string | null;
  taxCategoryId: string | null;
  stripeTaxCode: string;
  amount: number;
  quantity: number;
  taxAmount: number;
  taxBehavior: "exclusive" | "inclusive";
  breakdown: StripeTaxBreakdownSnapshot[];
}

export interface StripeTaxCalculationSnapshot {
  provider: "stripe_tax";
  calculationId: string;
  livemode: boolean;
  currency: "usd";
  expiresAt: number | null;
  taxDate: number;
  taxAmountExclusive: number;
  taxAmountInclusive: number;
  taxAmount: number;
  amountTotal: number;
  customerAddressSource: "shipping";
  customerAddress: StripeTaxAddressSnapshot;
  shipFromAddress: StripeTaxAddressSnapshot;
  lineItems: StripeTaxLineSnapshot[];
  breakdown: StripeTaxBreakdownSnapshot[];
}

export interface StripeTaxCalculationResult {
  taxAmount: number;
  amountTotal: number;
  snapshot: StripeTaxCalculationSnapshot;
  productTaxById: Map<string, StripeTaxLineSnapshot>;
}

export class StripeTaxCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeTaxCalculationError";
  }
}

function storeAddress(store: TrustedCheckoutStore): StripeTaxAddressSnapshot {
  return {
    line1: store.address,
    city: store.city,
    state: store.state,
    postalCode: store.zip,
    country: "US",
  };
}

function customerAddress(
  fulfillmentType: "delivery" | "pickup",
  deliveryAddress: CheckoutPaymentAddressInput | undefined,
  store: TrustedCheckoutStore
): StripeTaxAddressSnapshot {
  if (fulfillmentType === "pickup") return storeAddress(store);
  if (!deliveryAddress) {
    throw new StripeTaxCalculationError("A verified delivery address is required for tax calculation.");
  }
  return {
    line1: deliveryAddress.street,
    city: deliveryAddress.city,
    state: deliveryAddress.state.toUpperCase(),
    postalCode: deliveryAddress.zip,
    country: "US",
  };
}

function toStripeAddress(address: StripeTaxAddressSnapshot) {
  return {
    line1: address.line1,
    city: address.city,
    state: address.state,
    postal_code: address.postalCode,
    country: address.country,
  };
}

function mapLineBreakdown(
  breakdown: Stripe.Tax.CalculationLineItem.TaxBreakdown[] | null | undefined
): StripeTaxBreakdownSnapshot[] {
  return (breakdown ?? []).map((entry) => ({
    amount: entry.amount,
    taxableAmount: entry.taxable_amount,
    taxabilityReason: entry.taxability_reason,
    sourcing: entry.sourcing,
    jurisdiction: {
      country: entry.jurisdiction.country,
      state: entry.jurisdiction.state,
      level: entry.jurisdiction.level,
      displayName: entry.jurisdiction.display_name,
    },
    rate: entry.tax_rate_details ? {
      displayName: entry.tax_rate_details.display_name,
      percentage: entry.tax_rate_details.percentage_decimal,
      taxType: entry.tax_rate_details.tax_type,
    } : null,
  }));
}

function mapCalculationBreakdown(
  breakdown: Stripe.Tax.Calculation.TaxBreakdown[]
): StripeTaxBreakdownSnapshot[] {
  return breakdown.map((entry) => ({
    amount: entry.amount,
    taxableAmount: entry.taxable_amount,
    taxabilityReason: entry.taxability_reason,
    sourcing: null,
    jurisdiction: null,
    rate: {
      displayName: entry.tax_rate_details.tax_type ?? "Tax",
      percentage: entry.tax_rate_details.percentage_decimal,
      taxType: entry.tax_rate_details.tax_type ?? "none",
    },
  }));
}

function referenceType(reference: string): StripeTaxLineType {
  if (reference === "service_fee") return "service_fee";
  if (reference === "tip") return "tip";
  return "product";
}

export async function createStripeTaxCalculation(
  stripe: Stripe,
  input: {
    fulfillmentType: "delivery" | "pickup";
    items: TrustedCheckoutItem[];
    store: TrustedCheckoutStore;
    deliveryAddress?: CheckoutPaymentAddressInput;
    pricingBeforeTax: StripeTaxPricingInput;
  }
): Promise<StripeTaxCalculationResult> {
  const supplementalLineCount =
    (input.pricingBeforeTax.serviceFeeAmount > 0 ? 1 : 0) +
    (input.pricingBeforeTax.tipAmount > 0 ? 1 : 0);
  if (input.items.length + supplementalLineCount > 100) {
    throw new StripeTaxCalculationError("This cart has too many distinct products for one checkout.");
  }

  const destination = customerAddress(
    input.fulfillmentType,
    input.deliveryAddress,
    input.store
  );
  const origin = storeAddress(input.store);
  const lineItems: Stripe.Tax.CalculationCreateParams.LineItem[] =
    input.items.map((item) => ({
      amount: item.lineTotalAmount,
      quantity: item.quantity,
      reference: `product:${item.productId}`,
      tax_behavior: "exclusive",
      tax_code: item.stripeTaxCode,
      metadata: {
        type: "product",
        productId: item.productId,
        taxCategoryId: item.taxCategoryId,
      },
    }));

  if (input.pricingBeforeTax.serviceFeeAmount > 0) {
    lineItems.push({
      amount: input.pricingBeforeTax.serviceFeeAmount,
      quantity: 1,
      reference: "service_fee",
      tax_behavior: "exclusive",
      tax_code: SERVICE_FEE_TAX_CODE,
      metadata: {type: "service_fee"},
    });
  }
  if (input.pricingBeforeTax.tipAmount > 0) {
    lineItems.push({
      amount: input.pricingBeforeTax.tipAmount,
      quantity: 1,
      reference: "tip",
      tax_behavior: "exclusive",
      tax_code: OPTIONAL_GRATUITY_TAX_CODE,
      metadata: {type: "tip"},
    });
  }

  const calculation = await stripe.tax.calculations.create({
    currency: "usd",
    customer_details: {
      address: toStripeAddress(destination),
      address_source: "shipping",
    },
    ship_from_details: {address: toStripeAddress(origin)},
    line_items: lineItems,
    shipping_cost: input.pricingBeforeTax.deliveryFeeAmount > 0 ? {
      amount: input.pricingBeforeTax.deliveryFeeAmount,
      tax_behavior: "exclusive",
      tax_code: SHIPPING_TAX_CODE,
    } : undefined,
    expand: ["line_items"],
  });

  if (!calculation.id) {
    throw new StripeTaxCalculationError("Stripe Tax did not return a calculation reference.");
  }

  const calculatedLines = calculation.line_items?.has_more
    ? (await stripe.tax.calculations.listLineItems(
        calculation.id,
        {limit: 100}
      )).data
    : calculation.line_items?.data ?? [];
  const sourceItems = new Map(input.items.map((item) => [item.productId, item]));
  const snapshots: StripeTaxLineSnapshot[] = calculatedLines.map((line) => {
    const productId = line.reference.startsWith("product:")
      ? line.reference.slice("product:".length)
      : null;
    const source = productId ? sourceItems.get(productId) : undefined;
    return {
      reference: line.reference,
      type: referenceType(line.reference),
      productId,
      taxCategoryId: source?.taxCategoryId ?? null,
      stripeTaxCode: line.tax_code,
      amount: line.amount,
      quantity: line.quantity,
      taxAmount: line.amount_tax,
      taxBehavior: line.tax_behavior,
      breakdown: mapLineBreakdown(line.tax_breakdown),
    };
  });

  if (calculation.shipping_cost) {
    snapshots.push({
      reference: "delivery_fee",
      type: "delivery_fee",
      productId: null,
      taxCategoryId: null,
      stripeTaxCode: calculation.shipping_cost.tax_code,
      amount: calculation.shipping_cost.amount,
      quantity: 1,
      taxAmount: calculation.shipping_cost.amount_tax,
      taxBehavior: calculation.shipping_cost.tax_behavior,
      breakdown: mapLineBreakdown(calculation.shipping_cost.tax_breakdown),
    });
  }

  const taxAmount = calculation.tax_amount_exclusive + calculation.tax_amount_inclusive;
  const expectedTotal = input.pricingBeforeTax.totalAmount + taxAmount;
  if (calculation.amount_total !== expectedTotal) {
    throw new StripeTaxCalculationError("Stripe Tax returned an amount that does not match this checkout.");
  }

  const productTaxById = new Map<string, StripeTaxLineSnapshot>();
  snapshots.forEach((snapshot) => {
    if (snapshot.productId) productTaxById.set(snapshot.productId, snapshot);
  });
  if (productTaxById.size !== input.items.length) {
    throw new StripeTaxCalculationError("Stripe Tax did not classify every product in this checkout.");
  }

  return {
    taxAmount,
    amountTotal: calculation.amount_total,
    productTaxById,
    snapshot: {
      provider: "stripe_tax",
      calculationId: calculation.id,
      livemode: calculation.livemode,
      currency: "usd",
      expiresAt: calculation.expires_at,
      taxDate: calculation.tax_date,
      taxAmountExclusive: calculation.tax_amount_exclusive,
      taxAmountInclusive: calculation.tax_amount_inclusive,
      taxAmount,
      amountTotal: calculation.amount_total,
      customerAddressSource: "shipping",
      customerAddress: destination,
      shipFromAddress: origin,
      lineItems: snapshots,
      breakdown: mapCalculationBreakdown(calculation.tax_breakdown),
    },
  };
}

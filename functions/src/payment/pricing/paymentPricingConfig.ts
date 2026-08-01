/*
|--------------------------------------------------------------------------
| Payment Pricing Configuration
|--------------------------------------------------------------------------
|
| Trusted backend pricing rules used by Firebase Functions.
|
| Important:
|
| The customer browser can display estimated prices, but Firebase
| Functions must calculate the final Stripe amount independently.
|
| This file currently mirrors:
|
| - src/config/pricing.ts
| - src/config/delivery.ts
| - src/hooks/useCheckoutPricing.ts
|
| The current customer checkout total is:
|
| subtotal
| + delivery fee
| + service fee
| + sales tax on subtotal
| + customer tip
| = total
|
| Important:
|
| These values are trusted MVP fallback settings.
|
| The future admin portal will manage the active pricing configuration
| in Firestore. Firebase Functions will load that configuration before
| calculating the final Stripe amount.
*/


/*
  Currency used by the LIA Store MVP.

  Stripe amounts will be sent as integer cents.
*/
export const PAYMENT_CURRENCY = "usd" as const;


/*
  Delivery rules used to calculate the trusted delivery fee.
*/
export const PAYMENT_DELIVERY_CONFIG = {
  /*
    Orders outside this radius are rejected.
  */
  maxRadiusMiles: 25,

  /*
    Fee covering the first five delivery miles.
  */
  baseDeliveryFeeCents: 799,

  /*
    Distance included in the base fee.
  */
  baseDistanceMiles: 5,

  /*
    Additional fee for each mile beyond the base distance.
  */
  costPerMileCents: 175,

  /*
    Optional peak-time surcharge.

    Peak pricing is not currently enabled in checkout preparation, but
    the value is preserved for future server-side use.
  */
  peakSurchargeCents: 199,
} as const;


/*
  Order-level pricing rules.
*/
export const PAYMENT_PRICING_CONFIG = {
  /*
    Subtotals at or above this amount receive free delivery.

    15000 cents = $150.00
  */
  freeDeliveryMinimumCents: 15_000,

  /*
    LIA funds driver compensation for qualifying free-delivery orders.

    The customer receives free delivery at the configured threshold, while
    the incentive is deducted from LIA's retained marketplace revenue.
  */
  freeDeliveryDriverIncentiveWithoutTipCents: 500,

  /*
    A customer tip already contributes to driver earnings, so LIA provides a
    smaller $3.00 incentive when a qualifying free-delivery order has a tip.
  */
  freeDeliveryDriverIncentiveWithTipCents: 300,

  /*
    Default minimum order.

    Individual stores may override this with their own minimumOrder
    Firestore field.

    3000 cents = $30.00
  */
  defaultMinimumOrderCents: 3_000,

    /*
    Customer-facing service fee percentage retained by LIA.

    0.05 = 5%

    This fee helps cover platform operations such as payment processing,
    customer support, infrastructure, refunds, and dispute risk.
  */
  serviceFeeRate: 0.05,

  /*
    Minimum customer service fee.

    199 cents = $1.99
  */
  minimumServiceFeeCents: 199,

  /*
    Maximum customer service fee.

    999 cents = $9.99
  */
  maximumServiceFeeCents: 999,
  
  /*
    Current sales-tax rate.

    The customer checkout presently calculates tax only from the
    merchandise subtotal.

    This is an MVP rule and will later need jurisdiction-aware tax
    calculation.
  */
  salesTaxRate: 0.08,

  /*
    Default commission retained from store merchandise earnings.

    This does not change the amount charged to the customer.

    It will later be used when calculating store earnings and Stripe
    transfers.
  */
  defaultCommissionRate: 0.15,
} as const;

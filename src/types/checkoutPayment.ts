/*
|--------------------------------------------------------------------------
| Checkout Payment Types
|--------------------------------------------------------------------------
|
| These types define the secure boundary between the checkout UI and
| the backend payment workflow.
|
| Important:
|
| The browser is allowed to choose:
|
| - Which store it is ordering from
| - Which product IDs and quantities it wants
| - The delivery destination
| - Delivery instructions
| - The customer-selected tip
|
| The browser is NOT trusted to decide:
|
| - Product prices
| - Product names
| - Store payout account
| - Delivery fee
| - Tax
| - Subtotal
| - Final total
| - Stripe charge amount
|
| The backend must rebuild all financial values from trusted data.
*/


/*
  Product selection submitted by the customer.

  The backend loads the actual product from Firestore using productId.
*/
export interface CheckoutPaymentItemInput {
  /*
    Firestore product document ID.
  */
  productId: string;

  /*
    Quantity requested by the customer.
  */
  quantity: number;

  /*
    Selected size when the product supports size variations.

    This remains optional because many grocery products do not use a
    selectable size.
  */
  size?: {
    value: number;
    unit: string;
  } | null;
}


/*
  Delivery destination submitted by the customer.

  The backend will later validate and normalize this data before using
  it for delivery pricing and order creation.
*/
export interface CheckoutPaymentAddressInput {
  street: string;
  city: string;
  state: string;
  zip: string;

  latitude?: number;
  longitude?: number;

  formattedAddress?: string;
}


/*
  Secure checkout request sent from the browser to the backend.

  This intentionally excludes all client-calculated prices and totals.
*/
export interface PrepareCheckoutPaymentInput {
  /*
    Firestore store document ID.
  */
  storeId: string;

  /*
    Product IDs, quantities, and optional selected sizes.
  */
  items: CheckoutPaymentItemInput[];

  /*
    Customer delivery destination.
  */
  deliveryAddress: CheckoutPaymentAddressInput;

  /*
    Optional delivery instructions.
  */
  deliveryInstructions?: string;

  /*
    Customer-selected tip in cents.

    Example:

    500 = $5.00

    Integer cents avoid floating-point money errors.
  */
  tipAmountCents: number;
}


/*
  Trusted pricing calculated by the backend.

  Every amount is stored as an integer in the currency's smallest unit.

  For USD:

  100 = $1.00
*/
export interface TrustedCheckoutPricing {
  currency: "usd";

  subtotalAmount: number;

  deliveryFeeAmount: number;

  taxAmount: number;

  tipAmount: number;

  totalAmount: number;
}


/*
  Safe response returned after the backend prepares the payment.

  The clientSecret is used only by Stripe's browser payment components.
  It does not expose the platform secret key.
*/
export interface PrepareCheckoutPaymentResult {
  orderId: string;

  paymentIntentId: string;

  clientSecret: string;

  pricing: TrustedCheckoutPricing;
}
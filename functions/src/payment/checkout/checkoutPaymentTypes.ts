/*
|--------------------------------------------------------------------------
| Checkout Payment Types
|--------------------------------------------------------------------------
|
| Secure request and response models for Firebase Functions.
|
| These types define the boundary between:
|
| Checkout browser
|       ↓
| Firebase callable function
|       ↓
| Trusted product, store, pricing, and Stripe services
|
| Security rule:
|
| The browser may submit customer choices.
| The browser may not decide payment-critical financial values.
*/


/*
  Product selection supplied by the customer.

  The backend will retrieve the current product document and rebuild:

  - Product name
  - Product price
  - Product image
  - Store relationship
  - Availability
  - Stock
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
    Optional product size selected by the customer.

    The backend will preserve this selection in the order snapshot.
  */
  size?: {
    value: number;
    unit: string;
  } | null;
}


/*
  Delivery destination supplied by the customer.
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
  Request received by the future prepareCheckoutPayment callable
  function.
*/
export interface PrepareCheckoutPaymentRequest {
  fulfillmentType: "delivery" | "pickup";
  /*
    Firestore store document ID.
  */
  storeId: string;

    /*
    Delivery contact name selected by the authenticated customer.

    This may differ from the customer account profile when the order is
    being delivered to another person.
  */
  contactName: string;

  /*
    Delivery contact phone number used by the store and driver.

    The runtime validator will normalize and validate this value before
    the order is created.
  */
  contactPhone: string;

  /*
    Customer-selected products and quantities.
  */
  items: CheckoutPaymentItemInput[];

  /*
    Customer delivery destination.
  */
  deliveryAddress?: CheckoutPaymentAddressInput;

  /*
    Optional delivery instructions.
  */
  deliveryInstructions?: string;

  pickupInstructions?: string;

  /*
    Customer-selected driver tip in cents.

    Example:

    500 = $5.00
  */
  tipAmountCents: number;
}


/*
  Trusted product snapshot saved on the pending order.

  Every value except size and quantity comes from Firestore.
*/
export interface TrustedCheckoutItem {
  productId: string;

  storeId: string;

  name: string;

  /*
    Current trusted unit price in cents.
  */
  unitPriceAmount: number;

  /*
    Regular unit price before an active product discount, in cents.
    Omitted when no product discount applies.
  */
  originalUnitPriceAmount?: number;

  quantity: number;

  /*
    unitPriceAmount × quantity
  */
  lineTotalAmount: number;

  /* Immutable Admin-controlled tax classification used by Stripe Tax. */
  taxCategoryId: string;

  stripeTaxCode: string;

  imageUrl?: string;

  size?: {
    value: number;
    unit: string;
  } | null;
}


/*
  Trusted store snapshot saved on the pending order.
*/
export interface TrustedCheckoutStore {
  id: string;

  ownerId: string;

  name: string;

  address: string;

  city: string;

  state: string;

  zip: string;

  country: "US";

  phone: string;

  latitude: number;

  longitude: number;

  homeZoneId: string | null;

  serviceZoneIds: string[];

  pickupEnabled: boolean;
  pickupPreparationMinutes: number | null;
  pickupInstructions: string | null;

  /*
    Connected account used later for store transfers.

    Checkout preparation may require the store to be payout-ready
    before accepting customer payment.
  */
  stripeAccountId: string;

  stripeTransfersEnabled: boolean;

  stripeIsReady: boolean;
}


/*
  Trusted customer information obtained from Firebase Authentication
  and validated request data.
*/
export interface TrustedCheckoutCustomer {
  /*
    Authenticated Firebase UID.

    This determines ownership of the order.
  */
  uid: string;

  /*
    Email obtained from Firebase Authentication.
  */
  email: string;

  /*
    Validated delivery contact name supplied during checkout.
  */
  name: string;

  /*
    Validated delivery contact phone supplied during checkout.
  */
  phone: string;
}


/*
  Safe response returned to the customer browser after the backend
  creates a payment-pending order and Stripe PaymentIntent.
*/
export interface PrepareCheckoutPaymentResponse {
  success: true;

  orderId: string;

  /*
    Customer-owned LIA checkout session used for safe live payment status
    updates before the full order becomes readable.
  */
  checkoutSessionId: string;

  orderNumber: string;

  paymentIntentId: string;

    /*
    PaymentIntent client secret used to confirm this order payment.
  */
  clientSecret: string;

  /*
    Short-lived Customer Session client secret.

    Stripe Elements uses this to:

    - Display saved payment methods
    - Offer consent to save a new payment method
    - Allow saved methods to be removed
  */
  customerSessionClientSecret: string;

  pricing: {
    currency: "usd";

    subtotalAmount: number;

    deliveryFeeAmount: number;

    serviceFeeAmount: number;

    taxAmount: number;

    tipAmount: number;

    totalAmount: number;
  };
}

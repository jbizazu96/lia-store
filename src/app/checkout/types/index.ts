/*
|--------------------------------------------------------------------------
| Checkout View Models
|--------------------------------------------------------------------------
|
| These types describe data used temporarily by the Checkout UI.
|
| They are NOT:
|
| • Firestore documents
| • Order domain models
| • Shipday models
| • Stripe models
|
| The checkout page sends this data to the order mapper, which creates
| the shared Order domain model from src/types/order.ts.
|
*/

/**
 * Customer delivery address entered or selected during checkout.
 */
export interface CheckoutAddress {
  street: string;

  city: string;

  state: string;

  zip: string;

  latitude?: number;

  longitude?: number;

  formattedAddress?: string;
}

/**
 * Product displayed in the checkout order summary.
 */
export interface CheckoutItem {
  id: string;

  storeId: string;

  storeName: string;

  name: string;

  price: number;

  quantity: number;

  imageUrl?: string;

  size?: {
    value: number;
    unit: string;
  } | null;
}

/**
 * Calculated totals displayed during checkout.
 */
export interface CheckoutTotals {
  subtotal: number;

  deliveryFee: number;

  tax: number;

  tip: number;

  total: number;
}

/**
 * Values collected by the checkout page before creating an Order.
 *
 * The order mapper transforms this into the shared Order domain model.
 */
export interface CheckoutSubmission {
  userId: string;

  customerName: string;

  customerPhone: string;

  customerEmail: string;

  storeId: string;

  storeOwnerId: string;

  storeName: string;

  storeAddress: string;

  storePhone: string;

  storeLatitude: number;

  storeLongitude: number;

  deliveryAddress: CheckoutAddress;

  customerLatitude: number;

  customerLongitude: number;

  deliveryInstructions?: string;

  deliveryDistanceMiles: number;

  estimatedDeliveryMinutes?: number;

  items: CheckoutItem[];

  totals: CheckoutTotals;
}
/*
|--------------------------------------------------------------------------
| Cart Types
|--------------------------------------------------------------------------
|
| Shared, display-only cart data. Checkout never trusts these fields for
| pricing, inventory, or store eligibility; Firebase Functions rebuild all
| payment-critical values from Firestore.
|
*/

export interface CartItem {
  id: string;

  name: string;

  price: number;

  originalPrice?: number;

  imageUrl?: string;

  quantity: number;

  /* Stock snapshot used only to prevent an avoidable cart over-selection. */
  stock?: number;

  storeId: string;

  storeName: string;

  storeAddress?: string;

  storePhone?: string;

  storeLatitude?: number;

  storeLongitude?: number;

  size?: {
    value: number;
    unit: string;
  };
}

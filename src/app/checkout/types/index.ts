/*
  Checkout page types.
*/

export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
}

export interface CheckoutItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
  size?: {
    value: number;
    unit: string;
  };
  storeId: string;
  storeName: string;
}

export interface OrderTotals {
  subtotal: number;
  deliveryFee: number;
  tax: number;
  total: number;
}
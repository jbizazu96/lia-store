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
  tip: number;
}

export interface OrderData {
  userId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  storeId: string;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeLatitude: number;
  storeLongitude: number;
  deliveryAddress: Address;
  customerLatitude: number;
  customerLongitude: number;
  deliveryInstructions: string;
  deliveryFee: number;
  items: CheckoutItem[];
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  status: string;
  createdAt: any;
  updatedAt: any;
  shipdayOrderId: string | null;
  shipdayTrackingId: string | null;
  shipdayTrackingUrl: string | null;
  shipdayStatus: string | null;
  shipdayCreated: boolean;
  shipdayError: string | null;
}
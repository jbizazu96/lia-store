
export interface StoreScheduleDay {
  day: string;
  open: string;
  close: string;
  isClosed: boolean;
}
export interface Store {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude: number;
  longitude: number;
  placeId: string;
  formattedAddress: string;
  logoUrl: string;
  bannerUrl: string;
  category?: string;
  rating?: number;
  distance?: number;
  deliveryFee?: number;
  minimumOrder: number;
  status: "pending" | "active" | "suspended";
  isOpen: boolean;
  schedule?: StoreScheduleDay[];
  createdAt: string;
  updatedAt: string;
  // Stripe
  stripeAccountId?: string;
  // Legal
  businessType?: string;
  registeredName?: string;
  ein?: string;
  businessStructure?: string;
  photoIdUrl?: string;
  storeFrontUrl?: string;
  storeInsideUrl?: string;
  // Stripe Connect
  stripeEmail?: string;
  stripePhone?: string;
  stripeBusinessType?: string;
  stripeAccountType?: string;
}

// Also export any other types you might need
export interface StoreWithDistance extends Store {
  distance: number;
  deliveryFee: number;
  estimatedDeliveryTime: string;
}

export interface StoreFilters {
  search?: string;
  category?: string;
  city?: string;
  state?: string;
  minRating?: number;
  openNow?: boolean;
}
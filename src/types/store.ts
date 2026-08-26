
export interface StoreScheduleDay {
  day: string;
  open: string;
  close: string;
  isClosed: boolean;
}

export interface StoreOwnerProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  formattedAddress?: string;
  photoIdUrl?: string;
}
export interface StoreImageVariants {
  thumbnail?: string;
  small?: string;
  medium?: string;
  large?: string;
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
  country?: string;
  latitude: number;
  longitude: number;
  placeId: string;
  formattedAddress: string;
  logoUrl: string;
  bannerUrl: string;
  logoImageVariants?: StoreImageVariants;
  bannerImageVariants?: StoreImageVariants;
  category?: string;
  rating?: number;
  reviewCount?: number;
  distance?: number;
  deliveryFee?: number;
  minimumOrder: number;
  pickupEnabled?: boolean;
  pickupPreparationMinutes?: number;
  pickupInstructions?: string;
  /* Approval unlocks owner tools; activation publishes to customers. */
  isApproved: boolean;
  isActive: boolean;
  onboardingCompleted?: boolean;
  onboardingStep?: "owner" | "store-information" | "business-information" | "schedule" | "agreement" | "stripe";
  owner?: StoreOwnerProfile;
  isOpen: boolean;
  schedule?: StoreScheduleDay[];
  createdAt: string;
  updatedAt: string;
  // Stripe
  stripeAccountId?: string;
  stripeConnectApiVersion?: "v2";
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

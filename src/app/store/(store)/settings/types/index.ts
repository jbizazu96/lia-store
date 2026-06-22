/*
  Settings page types.
*/

export interface StoreSettings {
  // Profile
  name: string;
  description: string;
  phone: string;
  email: string;
  logoUrl: string;
  bannerUrl: string;

  // Business
  businessType: string;
  registeredName: string;
  ein: string;
  businessStructure: string;

  // Address
  address: string;
  city: string;
  state: string;
  zip: string;
  latitude: number;
  longitude: number;

  // Delivery
  deliveryRadius: number;
  minimumOrder: number;
  deliveryFee: number;
  freeDeliveryThreshold: number;
  isOpen: boolean;
  estimatedPrepTime: number;

  // Payment
  stripeAccountId: string;
  stripeAccountStatus: "pending" | "active" | "inactive";

  // Notifications
  emailNotifications: boolean;
  orderNotifications: boolean;
  marketingEmails: boolean;
  pushNotifications: boolean;
}

export interface UserSettings {
  displayName: string;
  email: string;
  phone: string;
  language: string;
}
export interface User {
  uid: string;
  displayName: string;
  email: string;
  phone: string;
  accountType: "customer" | "store_owner" | "admin";
  role: string;
  isActive: boolean;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  defaultAddress?: {
    street: string;
    city: string;
    state: string;
    zip: string;
    latitude: number;
    longitude: number;
    formattedAddress: string;
  };
  recentSearches?: string[]; // ✅ Add this field
  createdAt: string;
}
import type {
  Timestamp,
} from "firebase/firestore";

export interface User {
  uid: string;
  displayName: string;
  email: string;
  phone: string;
  accountType: "customer" | "store_owner" | "driver" | "admin";
  role: string;
  isActive: boolean;
  emailVerified: boolean;
  emailVerifiedAt: Timestamp | null;
  onboardingCompleted?: boolean;
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
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

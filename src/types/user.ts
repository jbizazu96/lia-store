/* This file check the user role and manage to show the correct document */
export type UserRole =
  | "customer"
  | "store_owner"
  | "admin";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  isActive: boolean;
}
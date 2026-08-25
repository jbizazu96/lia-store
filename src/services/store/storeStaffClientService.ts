import {httpsCallable} from "firebase/functions";
import {functions} from "@/lib/firebase";

export type StoreStaffAccessLevel = "read" | "write";
export type StoreStaffPermissions = Partial<Record<"orders" | "products", StoreStaffAccessLevel>>;
export interface StoreStaffUser {
  uid: string;
  email: string;
  displayName: string;
  isActive: boolean;
  permissions: StoreStaffPermissions;
  createdAt: string | null;
  updatedAt: string | null;
}

async function call<T>(name: string, data?: unknown) {
  return (await httpsCallable<unknown, T>(functions, name)(data)).data;
}

export const storeStaffClientService = {
  list: () => call<{users: StoreStaffUser[]}>("getStoreStaffUsers"),
  create: (input: {email: string; displayName: string; password: string; permissions: StoreStaffPermissions}) => call<{success: true; uid: string}>("createStoreStaffUser", input),
  update: (input: {uid: string; displayName: string; isActive: boolean; permissions: StoreStaffPermissions}) => call<{success: true}>("updateStoreStaffUser", input),
  remove: (uid: string) => call<{success: true}>("deleteStoreStaffUser", {uid}),
};

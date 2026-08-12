import {httpsCallable} from "firebase/functions";
import {functions} from "@/lib/firebase";
import type {AdminPermissions, ManagedAdminUser} from "@/types/adminAccess";

async function call<T>(name: string, input?: unknown): Promise<T> {
  const result = await httpsCallable<unknown, T>(functions, name)(input);
  return result.data;
}

export const adminUserClientService = {
  list: () => call<{users: ManagedAdminUser[]}>("getAdminUsers"),
  create: (input: {displayName: string; email: string; password: string; permissions: AdminPermissions}) =>
    call<{success: true; uid: string}>("createAdminUser", input),
  update: (input: {uid: string; displayName: string; permissions: AdminPermissions; isActive: boolean}) =>
    call<{success: true}>("updateAdminUser", input),
  delete: (uid: string) => call<{success: true}>("deleteAdminUser", {uid}),
};

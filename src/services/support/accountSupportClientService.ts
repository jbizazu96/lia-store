import {httpsCallable} from "firebase/functions";
import {functions} from "@/lib/firebase";

export type AccountSupportReason = "account" | "orders" | "payments" | "delivery" | "technical" | "other";
export interface AccountSupportRequest {id: string; ownerId: string; ownerType: string; ownerName: string; ownerEmail: string; reason: string; message: string; status: string; createdAt: string | null; updatedAt: string | null; adminResponse: {message: string; respondedAt: string | null} | null}

async function call<T>(name: string, data: Record<string, unknown> = {}): Promise<T> {
  const result = await httpsCallable<Record<string, unknown>, T>(functions, name)(data);
  return result.data;
}

export const accountSupportClientService = {
  create: (input: {reason: AccountSupportReason; message: string}) => call<{success: boolean; requestId: string}>("createAccountSupportRequest", input),
  listAdmin: (status = "all") => call<{requests: AccountSupportRequest[]}>("getAdminAccountSupportRequests", {status}),
  respondAdmin: (input: {requestId: string; message: string; status: "in_review" | "responded" | "resolved"}) => call<{success: boolean}>("respondAdminAccountSupportRequest", input),
};

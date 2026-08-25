import {httpsCallable} from "firebase/functions";
import {functions} from "@/lib/firebase";

export type AccountSupportReason = "account" | "orders" | "payments" | "delivery" | "technical" | "other";
export interface AccountSupportRequest {id: string; ownerId: string; ownerType: string; ownerName: string; ownerEmail: string; reason: string; message: string; status: string; createdAt: string | null; updatedAt: string | null; assignedTo: {uid: string; name: string; email: string} | null; adminResponse: {message: string; respondedAt: string | null} | null}
export interface AccountSupportMessage {id: string; visibility: "customer" | "internal"; senderType: string; senderName: string; message: string; createdAt: string | null}

async function call<T>(name: string, data: Record<string, unknown> = {}): Promise<T> {
  const result = await httpsCallable<Record<string, unknown>, T>(functions, name)(data);
  return result.data;
}

export const accountSupportClientService = {
  create: (input: {reason: AccountSupportReason; message: string}) => call<{success: boolean; requestId: string}>("createAccountSupportRequest", input),
  listAdmin: (status = "all", cursor?: string) => call<{requests: AccountSupportRequest[]; nextCursor: string | null}>("getAdminAccountSupportRequests", {status, ...(cursor ? {cursor} : {})}),
  respondAdmin: (input: {requestId: string; message: string; status: "in_review" | "responded" | "resolved"}) => call<{success: boolean}>("respondAdminAccountSupportRequest", input),
  getConversation: (requestId: string) => call<{request: AccountSupportRequest; messages: AccountSupportMessage[]}>("getAdminAccountSupportConversation", {requestId}),
  assignAdmin: (requestId: string, assigneeId: string) => call<{success: boolean}>("assignAdminAccountSupportRequest", {requestId, assigneeId}),
  getAssignees: () => call<{assignees: Array<{uid: string; name: string; email: string}>}>("getAdminSupportAssignees"),
  addInternalNote: (requestId: string, message: string) => call<{success: boolean}>("addAdminAccountSupportInternalNote", {requestId, message}),
};

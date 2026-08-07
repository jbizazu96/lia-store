/* Customer refund claims are callable-only; no browser payment writes. */
import {httpsCallable} from "firebase/functions";
import {functions} from "@/lib/firebase";

async function call<T>(name: string, data: unknown): Promise<T> {
  try { return (await httpsCallable<unknown, T>(functions, name)(data)).data; }
  catch (error) { throw new Error(typeof (error as {message?: unknown}).message === "string" ? (error as {message: string}).message : "Unable to complete this support request."); }
}

export const refundClaimClientService = {
  get: (orderId: string) => call<{claim: null | {id: string; reason: string; description: string; status: string; createdAt: string | null; decisionReason: string | null; refundId: string | null; refundStatus: string | null}}>("getCustomerRefundClaim", {orderId}),
  create: (input: {orderId: string; reason: string; description: string}) => call<{claimId: string; status: string}>("createCustomerRefundClaim", input),
};

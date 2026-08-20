"use client";

import {httpsCallable} from "firebase/functions";
import {functions} from "@/lib/firebase";
import {invalidateCached, loadCached, writeCached} from "@/services/cache/clientDataCache";

export interface CustomerLegalDocumentStatus {
  documentKey: string; title: string; version: string; effectiveDate: string; lastUpdated: string;
  documentPath: string; documentHash: string; requiresAcceptance: boolean; acceptanceVerb: "agree" | "acknowledge";
}
export interface CustomerTermsStatus {
  accepted: boolean;
  documents: CustomerLegalDocumentStatus[];
  pendingDocuments: CustomerLegalDocumentStatus[];
}

async function call(name: string, data?: unknown): Promise<CustomerTermsStatus> {
  const result = await httpsCallable<unknown, CustomerTermsStatus>(functions, name)(data);
  return result.data;
}

export const customerLegalClientService = {
  getStatus: () => loadCached(
    "customer-legal-status",
    () => call("getCustomerTermsStatus"),
    {ttlMs: 30_000},
  ),
  acceptCurrentDocuments: async () => {
    const status = await call("acceptCustomerTerms", {accepted: true});
    writeCached("customer-legal-status", status, {ttlMs: 30_000});
    invalidateCached("customer-startup");
    return status;
  },
};

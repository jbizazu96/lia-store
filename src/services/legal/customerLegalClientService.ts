"use client";

import {httpsCallable} from "firebase/functions";
import {functions} from "@/lib/firebase";

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
  getStatus: () => call("getCustomerTermsStatus"),
  acceptCurrentDocuments: () => call("acceptCustomerTerms", {accepted: true}),
};

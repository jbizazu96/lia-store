"use client";

import {httpsCallable} from "firebase/functions";
import {functions} from "@/lib/firebase";

export type LegalDocumentStatus = "draft" | "published" | "archived";
export interface ManagedLegalDocument {
  id: string; documentKey: string; title: string; audience: string; version: string;
  content: string; documentHash: string; effectiveDate: string; lastUpdated: string;
  changeSummary: string; requiresAcceptance: boolean; status: LegalDocumentStatus;
  createdAt: string | null; updatedAt: string | null; publishedAt: string | null; archivedAt: string | null;
}
export interface LegalDocumentInput {documentKey: string; title: string; audience: string; version: string; content: string; effectiveDate: string; lastUpdated: string; changeSummary: string; requiresAcceptance: boolean}

async function call<T>(name: string, data?: unknown): Promise<T> {
  return (await httpsCallable<unknown, T>(functions, name)(data)).data;
}
export const adminLegalDocumentsClientService = {
  list: () => call<{documents: ManagedLegalDocument[]}>("getAdminLegalDocuments"),
  create: (input: LegalDocumentInput) => call<{id: string}>("createAdminLegalDocumentDraft", input),
  update: (id: string, input: LegalDocumentInput) => call<{updated: boolean}>("updateAdminLegalDocumentDraft", {id, ...input}),
  publish: (id: string) => call<{published: boolean}>("publishAdminLegalDocument", {id}),
  archive: (id: string) => call<{archived: boolean}>("archiveAdminLegalDocument", {id}),
  deleteDraft: (id: string) => call<{deleted: boolean}>("deleteAdminLegalDocumentDraft", {id}),
};

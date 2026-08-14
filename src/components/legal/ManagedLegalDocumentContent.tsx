"use client";

import {useEffect, useState} from "react";
import {httpsCallable} from "firebase/functions";
import {functions} from "@/lib/firebase";

interface PublicDocument {title: string; version: string; effectiveDate: string; lastUpdated: string; content: string}
export function ManagedLegalDocumentContent({documentKey, fallback}: {documentKey: string; fallback: React.ReactNode}) {
  const [document, setDocument] = useState<PublicDocument | null>(null);
  useEffect(() => { let active = true; void httpsCallable<{documentKey: string}, {document: PublicDocument}>(functions, "getPublicLegalDocument")({documentKey}).then((result) => { if (active) setDocument(result.data.document); }).catch(() => undefined); return () => { active = false; }; }, [documentKey]);
  if (!document) return <>{fallback}</>;
  const paragraphs = document.content.split(/\n\s*\n/).map((value) => value.trim()).filter(Boolean);
  return <><dl className="grid gap-2 border-b border-slate-200 pb-6 text-sm text-slate-600 sm:grid-cols-2"><div><dt className="font-bold text-slate-900">Effective date</dt><dd>{document.effectiveDate}</dd></div><div><dt className="font-bold text-slate-900">Last updated</dt><dd>{document.lastUpdated}</dd></div><div className="sm:col-span-2"><dt className="font-bold text-slate-900">Version</dt><dd>{document.version}</dd></div></dl><div className="mt-7 space-y-5 text-sm leading-7 text-slate-700">{paragraphs.map((paragraph, index) => /^\d+\./.test(paragraph) ? <h2 key={index} className="pt-3 text-lg font-black text-slate-950">{paragraph}</h2> : <p key={index}>{paragraph}</p>)}</div></>;
}

"use client";

import {useEffect, useState} from "react";
import {Check, X} from "lucide-react";

export interface LegalReviewDocument {
  key: string;
  title: string;
  path: string;
}

export function LegalReviewModal({documents, initialKey, onClose, onReviewed, onDeclined, decisionRequired = true}: {
  documents: LegalReviewDocument[];
  initialKey: string;
  onClose: () => void;
  onReviewed?: (documentKey: string) => void;
  onDeclined?: (documentKey: string) => void;
  decisionRequired?: boolean;
}) {
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const selected = documents.find((document) => document.key === selectedKey) ?? documents[0];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  if (!selected) return null;
  return <div className="fixed inset-0 z-[300] flex items-end justify-center bg-slate-950/55 backdrop-blur-[2px] sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label="Review legal documents" className="flex h-[96dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-[90dvh] sm:rounded-2xl">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-5 sm:pt-4">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-orange-600">LIA Marketplace</p><h2 className="text-lg font-black">Review legal documents</h2></div><button type="button" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700" aria-label="Close legal documents"><X className="h-5 w-5"/></button></div>
        {documents.length > 1 ? <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{documents.map((document) => <button key={document.key} type="button" onClick={() => setSelectedKey(document.key)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${document.key === selected.key ? "bg-orange-600 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>{document.title}</button>)}</div> : null}
      </header>
      <iframe key={selected.path} src={`${selected.path}${selected.path.includes("?") ? "&" : "?"}embedded=1`} title={selected.title} className="min-h-0 flex-1 border-0 bg-slate-50" />
      <footer className="shrink-0 border-t border-slate-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-4">{decisionRequired ? <><p className="mb-3 text-center text-xs text-slate-500">Choose whether you accept this document. Declining will not grant access to services that require acceptance.</p><div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => { onDeclined?.(selected.key); onClose(); }} className="rounded-full border border-slate-300 bg-white px-5 py-3 font-bold text-slate-700">Decline</button><button type="button" onClick={() => { onReviewed?.(selected.key); onClose(); }} className="flex items-center justify-center gap-2 rounded-full bg-orange-600 px-5 py-3 font-bold text-white"><Check className="h-5 w-5"/>Accept</button></div></> : <button type="button" onClick={onClose} className="flex w-full items-center justify-center gap-2 rounded-full bg-orange-600 px-5 py-3 font-bold text-white"><Check className="h-5 w-5"/>Back to sign in</button>}</footer>
    </section>
  </div>;
}

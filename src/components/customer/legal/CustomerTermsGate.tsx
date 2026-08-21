"use client";

import {useCallback, useEffect, useState} from "react";
import {CheckCircle2, FileText, RefreshCw} from "lucide-react";
import {BrandedLoader} from "@/components/ui/BrandedLoader";
import {customerLegalClientService, type CustomerLegalDocumentStatus} from "@/services/legal/customerLegalClientService";
import {LegalReviewModal} from "@/components/legal/LegalReviewModal";
import {customerLogoutService} from "@/services/auth/customerLogoutService";
import {startCustomerPerformanceTrace} from "@/services/performance/customerPerformanceService";

export function CustomerTermsGate({children}: {children: React.ReactNode}) {
  const [status, setStatus] = useState<"loading" | "required" | "accepted" | "error">("loading");
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingDocuments, setPendingDocuments] = useState<CustomerLegalDocumentStatus[]>([]);
  const [reviewingKey, setReviewingKey] = useState<string | null>(null);
  const [reviewedKeys, setReviewedKeys] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    try { const result = await customerLegalClientService.getStatus(); setPendingDocuments(result.pendingDocuments); setStatus(result.accepted ? "accepted" : "required"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "We could not verify your legal agreement status."); setStatus("error"); }
  }, []);

  useEffect(() => {
    let active = true;
    const legalTrace = startCustomerPerformanceTrace("customer_legal_ready");
    void customerLegalClientService.getStatus().then((result) => {
      if (active) { setPendingDocuments(result.pendingDocuments); setStatus(result.accepted ? "accepted" : "required"); legalTrace.stop({status: result.accepted ? "accepted" : "required"}); }
    }).catch((error: unknown) => {
      if (!active) return;
      legalTrace.stop({status: "error"});
      setMessage(error instanceof Error ? error.message : "We could not verify your legal agreement status.");
      setStatus("error");
    });
    return () => { active = false; legalTrace.stop({status: "cancelled"}); };
  }, []);

  const decline = async () => {
    if (saving) return;
    setSaving(true);
    try { await customerLogoutService.logout(); window.location.assign("/login"); }
    finally { setSaving(false); }
  };

  if (status === "accepted") return <>{children}</>;
  if (status === "loading") return <BrandedLoader message="Checking account agreements" />;
  if (status === "error") return <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4"><section className="w-full max-w-md rounded-2xl border border-red-100 bg-white p-6 text-center shadow-sm"><h1 className="text-lg font-black">Agreement status unavailable</h1><p className="mt-2 text-sm leading-6 text-slate-600">{message}</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => { setStatus("loading"); setMessage(""); void load(); }} className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700"><RefreshCw className="h-4 w-4" />Retry</button><button type="button" onClick={() => void decline()} className="rounded-full bg-orange-600 px-5 py-3 text-sm font-bold text-white">Back to login</button></div></section></main>;

  const accept = async () => {
    if (!checked || saving) return;
    setSaving(true); setMessage("");
    try { await customerLegalClientService.acceptCurrentDocuments(); setStatus("accepted"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The Terms could not be accepted. Please try again."); }
    finally { setSaving(false); }
  };
  const markReviewed = (key: string) => {
    setReviewedKeys((current) => {
      const next = new Set(current).add(key);
      if (pendingDocuments.every((document) => next.has(document.documentKey))) setChecked(true);
      return next;
    });
  };

  return <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-orange-50 via-white to-emerald-50 px-4 py-8"><section className="w-full max-w-lg rounded-2xl border border-orange-100 bg-white p-6 shadow-xl sm:p-8"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><FileText className="h-6 w-6" /></span><p className="mt-5 text-xs font-bold uppercase tracking-[.14em] text-orange-700">Legal update</p><h1 className="mt-2 text-2xl font-black text-slate-950">Review LIA’s current documents</h1><p className="mt-3 text-sm leading-6 text-slate-600">Review the documents below. You will only be asked again when LIA publishes a version that requires a new acknowledgment.</p><div className="mt-5 flex flex-wrap gap-2">{pendingDocuments.map((document) => <button type="button" key={document.documentKey} onClick={() => setReviewingKey(document.documentKey)} className="inline-flex items-center gap-2 rounded-full border border-orange-200 px-4 py-2.5 text-sm font-bold text-orange-700">{reviewedKeys.has(document.documentKey) ? <CheckCircle2 className="h-4 w-4 text-emerald-600"/> : null}Open {document.title} <FileText className="h-4 w-4" /></button>)}</div><label className="mt-6 flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-4 text-sm leading-6 text-slate-700"><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-orange-600" /><span>I agree to the LIA Terms of Service and acknowledge that I have read the LIA Privacy Policy.</span></label>{message ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{message}</p> : null}<div className="mt-5 grid grid-cols-2 gap-3"><button type="button" disabled={saving} onClick={() => void decline()} className="rounded-full border border-slate-300 px-5 py-3 font-bold text-slate-700 disabled:opacity-50">Decline</button><button type="button" disabled={!checked || saving} onClick={() => void accept()} className="flex items-center justify-center gap-2 rounded-full bg-orange-600 px-5 py-3 font-bold text-white disabled:opacity-50">{saving ? "Saving…" : <><CheckCircle2 className="h-5 w-5" />Accept</>}</button></div><p className="mt-4 text-center text-xs text-slate-500">Declining signs you out and protected customer pages remain unavailable.</p><p className="mt-2 text-center text-xs text-slate-500">Questions can be sent to <a href="mailto:info@liamarketplace.com" className="font-bold text-orange-700">info@liamarketplace.com</a>.</p></section>{reviewingKey ? <LegalReviewModal documents={pendingDocuments.map((document) => ({key: document.documentKey, title: document.title, path: document.documentPath}))} initialKey={reviewingKey} onReviewed={markReviewed} onDeclined={() => void decline()} onClose={() => setReviewingKey(null)}/> : null}</main>;
}

"use client";

import {useCallback, useEffect, useMemo, useState} from "react";
import {Archive, CopyPlus, FileText, Pencil, Plus, Send, Trash2, X} from "lucide-react";
import {useAdminAccess} from "@/context/AdminAccessContext";
import {adminLegalDocumentsClientService, type LegalDocumentInput, type ManagedLegalDocument} from "@/services/legal/adminLegalDocumentsClientService";
import {customerTermsIntroduction, customerTermsSections} from "@/content/legal/customerTerms";
import {customerPrivacyIntroduction, customerPrivacySections} from "@/content/legal/customerPrivacy";
import {CUSTOMER_TERMS_EFFECTIVE_DATE, CUSTOMER_TERMS_LAST_UPDATED, CUSTOMER_TERMS_VERSION} from "@/config/customerLegal";
import {CUSTOMER_PRIVACY_EFFECTIVE_DATE, CUSTOMER_PRIVACY_LAST_UPDATED, CUSTOMER_PRIVACY_VERSION} from "@/config/privacyLegal";

const empty: LegalDocumentInput = {documentKey: "customer_privacy", title: "", audience: "customer", version: "", content: "", effectiveDate: new Date().toISOString().slice(0, 10), lastUpdated: new Date().toISOString().slice(0, 10), changeSummary: "", requiresAcceptance: false};
const plainText = (introduction: string[], sections: Array<{title: string; paragraphs: string[]}>) => [...introduction, ...sections.flatMap((section) => [section.title, ...section.paragraphs])].join("\n\n");

export function AdminLegalDocumentsWorkspace() {
  const {canWrite} = useAdminAccess();
  const writable = canWrite("legal_documents");
  const [documents, setDocuments] = useState<ManagedLegalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<ManagedLegalDocument | "new" | null>(null);
  const [form, setForm] = useState<LegalDocumentInput>(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => { setLoading(true); setError(""); try { setDocuments((await adminLegalDocumentsClientService.list()).documents); } catch (cause) { setError(cause instanceof Error ? cause.message : "Legal documents could not be loaded."); } finally { setLoading(false); } }, []);
  useEffect(() => {
    let active = true;
    void adminLegalDocumentsClientService.list().then((result) => {
      if (active) setDocuments(result.documents);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Legal documents could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);
  const groups = useMemo(() => Object.entries(Object.groupBy(documents, (document) => document.documentKey)), [documents]);

  const open = (document?: ManagedLegalDocument, copy = false) => {
    if (!document) { setEditing("new"); setForm({...empty}); return; }
    setEditing(copy ? "new" : document);
    setForm({documentKey: document.documentKey, title: document.title, audience: document.audience, version: copy ? "" : document.version, content: document.content, effectiveDate: document.effectiveDate, lastUpdated: new Date().toISOString().slice(0, 10), changeSummary: copy ? `Replaces ${document.version}` : document.changeSummary, requiresAcceptance: document.requiresAcceptance});
  };
  const mutate = async (operation: () => Promise<unknown>) => { setSaving(true); setError(""); try { await operation(); setEditing(null); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "The legal document could not be changed."); } finally { setSaving(false); } };
  const submit = () => void mutate(() => editing === "new" ? adminLegalDocumentsClientService.create(form) : adminLegalDocumentsClientService.update(editing!.id, form));
  const importCurrentDocuments = () => void mutate(async () => {
    await adminLegalDocumentsClientService.create({documentKey: "customer_terms", title: "Customer Terms of Service", audience: "customer", version: CUSTOMER_TERMS_VERSION, content: plainText(customerTermsIntroduction, customerTermsSections), effectiveDate: CUSTOMER_TERMS_EFFECTIVE_DATE, lastUpdated: CUSTOMER_TERMS_LAST_UPDATED, changeSummary: "Initial managed version", requiresAcceptance: true});
    await adminLegalDocumentsClientService.create({documentKey: "customer_privacy", title: "Privacy Policy", audience: "customer", version: CUSTOMER_PRIVACY_VERSION, content: plainText(customerPrivacyIntroduction, customerPrivacySections), effectiveDate: CUSTOMER_PRIVACY_EFFECTIVE_DATE, lastUpdated: CUSTOMER_PRIVACY_LAST_UPDATED, changeSummary: "Initial managed version", requiresAcceptance: true});
  });

  return <div className="space-y-6 p-4 sm:p-6 lg:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Governance</p><h1 className="mt-1 text-2xl font-black">Legal documents</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Manage customer policies and agreement templates by version. Published versions are immutable and retained for acceptance evidence.</p></div>{writable ? <button onClick={() => open()} className="inline-flex items-center gap-2 rounded-full bg-orange-600 px-5 py-3 text-sm font-bold text-white"><Plus className="h-4 w-4"/>New document</button> : null}</header>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><strong>Signed merchant contracts remain store-specific.</strong> This library manages public policies and reusable agreement versions; uploaded signed PDFs remain in each Store application so they cannot be accidentally replaced here.</div>
    {error ? <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
    {loading ? <p className="text-sm text-slate-500">Loading legal documents…</p> : groups.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center"><FileText className="mx-auto h-8 w-8 text-slate-400"/><p className="mt-3 font-bold">No managed versions yet</p><p className="mt-1 text-sm text-slate-500">Import the current Terms and Privacy Policy as reviewable drafts, then publish both.</p>{writable ? <button disabled={saving} onClick={importCurrentDocuments} className="mt-5 rounded-full bg-orange-600 px-5 py-3 text-sm font-bold text-white">{saving ? "Importing…" : "Import current legal documents"}</button> : null}</div> : <div className="space-y-5">{groups.map(([key, entries]) => <section key={key} className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-black">{entries?.[0]?.title ?? key}</h2><p className="text-xs text-slate-500">{key}</p><div className="mt-4 divide-y divide-slate-100">{entries?.map((document) => <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-bold">{document.version} <span className={`ml-2 rounded-full px-2 py-1 text-[10px] uppercase ${document.status === "published" ? "bg-emerald-100 text-emerald-700" : document.status === "draft" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{document.status}</span>{document.requiresAcceptance ? <span className="ml-2 text-xs text-orange-700">Acceptance required</span> : null}</p><p className="mt-1 text-xs text-slate-500">Effective {document.effectiveDate} · {document.audience}</p></div><div className="flex flex-wrap gap-2">{document.status === "draft" && writable ? <><button onClick={() => open(document)} className="rounded-full border px-3 py-2 text-xs font-bold"><Pencil className="inline h-3.5 w-3.5"/> Edit</button><button disabled={saving} onClick={() => void mutate(() => adminLegalDocumentsClientService.publish(document.id))} className="rounded-full bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><Send className="inline h-3.5 w-3.5"/> Publish</button><button disabled={saving} onClick={() => window.confirm("Delete this draft?") && void mutate(() => adminLegalDocumentsClientService.deleteDraft(document.id))} className="rounded-full border border-red-200 px-3 py-2 text-xs font-bold text-red-700"><Trash2 className="inline h-3.5 w-3.5"/> Delete</button></> : null}{document.status !== "draft" && writable ? <button onClick={() => open(document, true)} className="rounded-full border px-3 py-2 text-xs font-bold"><CopyPlus className="inline h-3.5 w-3.5"/> New version</button> : null}{document.status === "published" && writable ? <button onClick={() => window.confirm("Archive this version? It will no longer be publicly active.") && void mutate(() => adminLegalDocumentsClientService.archive(document.id))} className="rounded-full border px-3 py-2 text-xs font-bold"><Archive className="inline h-3.5 w-3.5"/> Archive</button> : null}</div></div>)}</div></section>)}</div>}
    {editing ? <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 sm:items-center sm:p-6"><div className="max-h-[96vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-7"><div className="flex items-center justify-between"><h2 className="text-xl font-black">{editing === "new" ? "Create legal document draft" : "Edit draft"}</h2><button onClick={() => setEditing(null)} className="rounded-full bg-slate-100 p-2" aria-label="Close"><X className="h-5 w-5"/></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2">{([['documentKey','Document key'],['title','Title'],['audience','Audience'],['version','Version'],['effectiveDate','Effective date'],['lastUpdated','Last updated']] as const).map(([field,label]) => <label key={field} className="text-sm font-bold">{label}<input disabled={field === "documentKey" && editing !== "new"} value={form[field]} onChange={(event) => setForm({...form,[field]:event.target.value})} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal"/></label>)}</div><label className="mt-4 block text-sm font-bold">Change summary<textarea value={form.changeSummary} onChange={(event) => setForm({...form,changeSummary:event.target.value})} rows={2} className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 font-normal"/></label><label className="mt-4 block text-sm font-bold">Document content (plain text)<textarea value={form.content} onChange={(event) => setForm({...form,content:event.target.value})} rows={18} className="mt-1.5 w-full rounded-lg border border-slate-200 p-3 font-mono text-xs font-normal leading-5"/></label><label className="mt-4 flex gap-3 rounded-xl border border-orange-100 bg-orange-50 p-4 text-sm"><input type="checkbox" checked={form.requiresAcceptance} onChange={(event) => setForm({...form,requiresAcceptance:event.target.checked})} className="mt-0.5 accent-orange-600"/><span><strong>Require customer acceptance</strong><br/><span className="text-slate-600">Publishing this version will require affected customers to acknowledge or agree before continuing.</span></span></label><button disabled={saving || !form.title || !form.version || !form.content} onClick={submit} className="mt-5 w-full rounded-full bg-orange-600 px-5 py-3 font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save draft"}</button></div></div> : null}
  </div>;
}

"use client";

import Link from "next/link";
import {useEffect, useState} from "react";
import {ArrowLeft, LoaderCircle} from "lucide-react";
import {adminWorkspaceClientService} from "@/services/admin/adminWorkspaceClientService";
import type {AdminStoreApplicationPolicy} from "@/types/adminWorkspace";

const DOCUMENTS: Array<{
  key: keyof AdminStoreApplicationPolicy["requiredDocuments"];
  title: string;
  description: string;
}> = [
  {key: "ownerPhotoId", title: "Owner photo ID", description: "Identity image submitted by the store owner."},
  {key: "logo", title: "Store logo", description: "Logo used in the customer store profile."},
  {key: "banner", title: "Store banner", description: "Optional storefront banner unless required here."},
  {key: "storeFront", title: "Store front photo", description: "Exterior photo used to verify the location."},
  {key: "storeInside", title: "Store inside photo", description: "Interior photo used to verify the business."},
];

export function AdminStoreApplicationSettingsWorkspace() {
  const [policy, setPolicy] = useState<AdminStoreApplicationPolicy | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = async () => {
    setError("");
    try {
      const result = await adminWorkspaceClientService.getStoreApplicationPolicy();
      setPolicy(result.policy);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load store application settings.");
    }
  };

  useEffect(() => { void load(); }, []);

  const update = <K extends keyof AdminStoreApplicationPolicy>(
    key: K,
    value: AdminStoreApplicationPolicy[K],
  ) => {
    if (!policy) return;
    setSaved(false);
    setPolicy({...policy, [key]: value});
  };

  const updateDocument = (
    key: keyof AdminStoreApplicationPolicy["requiredDocuments"],
    value: boolean,
  ) => {
    if (!policy) return;
    setSaved(false);
    setPolicy({...policy, requiredDocuments: {...policy.requiredDocuments, [key]: value}});
  };

  const save = async () => {
    if (!policy) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await adminWorkspaceClientService.saveStoreApplicationPolicy(policy);
      setSaved(true);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save store application settings.");
    } finally {
      setSaving(false);
    }
  };

  if (!policy) return <div className="flex min-h-64 items-center justify-center">
    {error ? <p className="text-red-700">{error}</p> : <LoaderCircle className="h-8 w-8 animate-spin text-orange-600"/>}
  </div>;

  return <section>
    <Link href="/admin/settings" className="mb-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-700 ring-1 ring-slate-200">
      <ArrowLeft className="h-4 w-4"/>Back to settings
    </Link>
    <p className="text-sm font-bold tracking-wide text-orange-600">STORE APPLICATIONS</p>
    <h1 className="mt-1 text-3xl font-bold">Store application policy</h1>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Choose the application files a store must submit and the review gates for owner access and marketplace activation. Every change applies to future validation and is recorded in the Admin audit log.</p>
    {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {saved && <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-800">Store application policy saved and audited.</p>}
    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <h2 className="font-bold text-slate-950">Required uploads</h2>
      <p className="mt-1 text-sm text-slate-500">A disabled upload is optional during onboarding and does not block application review or activation.</p>
      <div className="mt-4 divide-y divide-slate-100">
        {DOCUMENTS.map((document) => <label key={document.key} className="flex cursor-pointer items-start justify-between gap-5 py-4">
          <span><span className="block font-semibold text-slate-900">{document.title}</span><span className="mt-1 block text-sm leading-5 text-slate-500">{document.description}</span></span>
          <input type="checkbox" checked={policy.requiredDocuments[document.key]} onChange={(event) => updateDocument(document.key, event.target.checked)} className="mt-1 h-5 w-5 accent-orange-600"/>
        </label>)}
      </div>
    </section>
    <section className="mt-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <h2 className="font-bold text-slate-950">Approval and activation</h2>
      <div className="mt-3 divide-y divide-slate-100">
        <Toggle title="Require a Stripe account before submission" description="The store must return from Stripe Connect with an account before it can submit the application." checked={policy.requireStripeAccount} onChange={(value) => update("requireStripeAccount", value)}/>
        <Toggle title="Allow workspace approval while documents are pending" description="Approved store owners can build their catalog before document review is complete. They remain unavailable to customers until activated." checked={policy.allowWorkspaceApprovalBeforeDocumentReview} onChange={(value) => update("allowWorkspaceApprovalBeforeDocumentReview", value)}/>
        <Toggle title="Require approved documents before activation" description="The store cannot become customer-visible until every required upload is approved." checked={policy.requireApprovedDocumentsForActivation} onChange={(value) => update("requireApprovedDocumentsForActivation", value)}/>
      </div>
    </section>
    <div className="sticky bottom-4 mt-6 flex justify-end rounded-2xl bg-white/95 p-3 shadow-lg ring-1 ring-slate-200 backdrop-blur">
      <button disabled={saving} onClick={() => void save()} className="rounded-xl bg-orange-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save store application policy"}</button>
    </div>
  </section>;
}

function Toggle({title, description, checked, onChange}: {title: string; description: string; checked: boolean; onChange: (value: boolean) => void}) {
  return <label className="flex cursor-pointer items-start justify-between gap-5 py-4"><span><span className="block font-semibold text-slate-900">{title}</span><span className="mt-1 block text-sm leading-5 text-slate-500">{description}</span></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-5 w-5 accent-orange-600"/></label>;
}

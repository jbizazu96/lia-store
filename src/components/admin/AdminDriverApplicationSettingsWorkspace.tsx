"use client";

import Link from "next/link";
import {useEffect, useState} from "react";
import {ArrowLeft, LoaderCircle} from "lucide-react";
import {adminWorkspaceClientService} from "@/services/admin/adminWorkspaceClientService";
import type {AdminDriverApplicationPolicy} from "@/types/adminWorkspace";

const DOCUMENTS: Array<{
  key: keyof AdminDriverApplicationPolicy["requiredDocuments"];
  title: string;
  description: string;
}> = [
  {key: "driversLicenseFront", title: "Driver license front", description: "Front image of a current driver license."},
  {key: "driversLicenseBack", title: "Driver license back", description: "Back image of the same current driver license."},
  {key: "vehicleInsurance", title: "Vehicle insurance", description: "Current proof of vehicle insurance."},
  {key: "vehicleRegistration", title: "Vehicle registration", description: "Current vehicle registration document."},
];

export function AdminDriverApplicationSettingsWorkspace() {
  const [policy, setPolicy] = useState<AdminDriverApplicationPolicy | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = async () => {
    setError("");
    try {
      const result = await adminWorkspaceClientService.getDriverApplicationPolicy();
      setPolicy(result.policy);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load driver application settings.");
    }
  };

  useEffect(() => { void load(); }, []);

  const update = <K extends keyof AdminDriverApplicationPolicy>(key: K, value: AdminDriverApplicationPolicy[K]) => {
    if (!policy) return;
    setSaved(false);
    setPolicy({...policy, [key]: value});
  };

  const updateDocument = (key: keyof AdminDriverApplicationPolicy["requiredDocuments"], value: boolean) => {
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
      await adminWorkspaceClientService.saveDriverApplicationPolicy(policy);
      setSaved(true);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save driver application settings.");
    } finally {
      setSaving(false);
    }
  };

  if (!policy) return <div className="flex min-h-64 items-center justify-center">{error ? <p className="text-red-700">{error}</p> : <LoaderCircle className="h-8 w-8 animate-spin text-orange-600"/>}</div>;

  return <section>
    <Link href="/admin/settings" className="mb-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-700 ring-1 ring-slate-200"><ArrowLeft className="h-4 w-4"/>Back to settings</Link>
    <p className="text-sm font-bold tracking-wide text-orange-600">DRIVER APPLICATIONS</p>
    <h1 className="mt-1 text-3xl font-bold">Driver application policy</h1>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Set driver eligibility and required documentation. The trusted onboarding and approval flows enforce these values; every saved change is audited.</p>
    {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {saved && <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-800">Driver application policy saved and audited.</p>}
    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100">
      <h2 className="font-bold text-slate-950">Eligibility</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><NumberInput label="Minimum driver age" min={18} max={100} value={policy.minimumAge} onChange={(value) => update("minimumAge", value)}/><NumberInput label="Maximum requested radius (miles)" min={1} max={100} value={policy.maximumPreferredRadiusMiles} onChange={(value) => update("maximumPreferredRadiusMiles", value)}/></div>
      <p className="mt-3 text-sm text-slate-500">A driver may request this radius; an administrator still selects the approved operating radius.</p>
    </section>
    <section className="mt-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><h2 className="font-bold text-slate-950">Required documents</h2><p className="mt-1 text-sm text-slate-500">Disabled documents are optional and do not block application submission or approval.</p><div className="mt-4 divide-y divide-slate-100">{DOCUMENTS.map((document) => <label key={document.key} className="flex cursor-pointer items-start justify-between gap-5 py-4"><span><span className="block font-semibold text-slate-900">{document.title}</span><span className="mt-1 block text-sm leading-5 text-slate-500">{document.description}</span></span><input type="checkbox" checked={policy.requiredDocuments[document.key]} onChange={(event) => updateDocument(document.key, event.target.checked)} className="mt-1 h-5 w-5 accent-orange-600"/></label>)}</div></section>
    <section className="mt-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><h2 className="font-bold text-slate-950">Submission and approval</h2><div className="mt-3 divide-y divide-slate-100"><Toggle title="Require Stripe payout setup before submission" description="Drivers must return from Stripe Connect with an account before submitting their application." checked={policy.requireStripeAccount} onChange={(value) => update("requireStripeAccount", value)}/><Toggle title="Require approved documents before driver approval" description="When enabled, a driver cannot be approved until every required document is present and approved." checked={policy.requireApprovedDocumentsForApproval} onChange={(value) => update("requireApprovedDocumentsForApproval", value)}/></div></section>
    <div className="sticky bottom-4 mt-6 flex justify-end rounded-2xl bg-white/95 p-3 shadow-lg ring-1 ring-slate-200 backdrop-blur"><button data-admin-write-action disabled={saving} onClick={() => void save()} className="rounded-xl bg-orange-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save driver application policy"}</button></div>
  </section>;
}

function NumberInput({label, min, max, value, onChange}: {label: string; min: number; max: number; value: number; onChange: (value: number) => void}) { return <label className="text-sm font-semibold text-slate-800">{label}<input type="number" min={min} max={max} step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 block w-full rounded-xl border border-slate-200 px-3 py-2.5"/></label>; }
function Toggle({title, description, checked, onChange}: {title: string; description: string; checked: boolean; onChange: (value: boolean) => void}) { return <label className="flex cursor-pointer items-start justify-between gap-5 py-4"><span><span className="block font-semibold text-slate-900">{title}</span><span className="mt-1 block text-sm leading-5 text-slate-500">{description}</span></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-5 w-5 accent-orange-600"/></label>; }

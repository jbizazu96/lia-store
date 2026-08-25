"use client";

import {FileText, LoaderCircle, Trash2, Upload, ExternalLink} from "lucide-react";
import {useEffect, useRef, useState} from "react";
import {adminWorkspaceClientService} from "@/services/admin/adminWorkspaceClientService";
import type {StoreContractSummary, StoreContractWorkspace} from "@/types/storeContract";
import {useAdminConfirmation} from "@/context/AdminConfirmationContext";

function fileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function StoreContractSection({storeId, disabled}: {storeId: string; disabled?: boolean}) {
  const confirm = useAdminConfirmation();
  const input = useRef<HTMLInputElement>(null);
  const [workspace, setWorkspace] = useState<StoreContractWorkspace | null>(null);
  const [selected, setSelected] = useState<StoreContractSummary | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const result = await adminWorkspaceClientService.getStoreContracts(storeId);
      setWorkspace(result);
      setSelected((current) => result.contracts.find((item) => item.id === current?.id) ?? result.contracts[0] ?? null);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The store contracts could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void adminWorkspaceClientService.getStoreContracts(storeId).then((result) => {
      if (!active) return;
      setWorkspace(result);
      setSelected(result.contracts[0] ?? null);
      setError("");
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "The store contracts could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [storeId]);

  const view = async (contract: StoreContractSummary) => {
    setSelected(contract); setPreviewUrl(""); setError("");
    try {
      const result = await adminWorkspaceClientService.getStoreContractPreview(storeId, contract.id);
      setPreviewUrl(result.url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The contract preview could not be opened.");
    }
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setWorking(true); setError("");
    try {
      for (const file of Array.from(files)) {
        setProgress(0);
        await adminWorkspaceClientService.uploadStoreContract(storeId, file, setProgress);
      }
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The contract could not be uploaded.");
    } finally {
      setWorking(false); setProgress(0);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async (contract: StoreContractSummary) => {
    if (!await confirm({title: "Remove signed contract?", description: `Remove ${contract.fileName}? This cannot be undone and the store will lose access to this copy.`, confirmationLabel: "Remove contract", tone: "danger"})) return;
    setWorking(true); setError("");
    try {
      await adminWorkspaceClientService.deleteStoreContract(storeId, contract.id);
      if (selected?.id === contract.id) { setSelected(null); setPreviewUrl(""); }
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The contract could not be removed.");
    } finally { setWorking(false); }
  };

  const commission = workspace ? (workspace.commission.basisPoints / 100).toFixed(2).replace(/\.00$/, "") : "—";

  return <section className="mt-7 border-t border-slate-100 pt-6">
    <div className="flex items-start gap-3"><FileText className="mt-0.5 h-5 w-5 text-orange-600"/><div><h3 className="font-bold text-slate-900">Store agreement</h3><p className="mt-1 text-sm text-slate-600">Keep exact signed PDF originals private and available to this store owner. PDFs are not modified after signing.</p></div></div>
    {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
        <input ref={input} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(event) => void upload(event.target.files)}/>
        <button data-admin-write-action type="button" disabled={disabled || working} onClick={() => input.current?.click()} className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-orange-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Upload className="h-4 w-4"/>{working ? `Uploading${progress ? ` ${progress}%` : "…"}` : "Upload signed PDF contracts"}</button>
        <p className="mt-2 text-xs text-slate-500">Multiple PDFs accepted · 10 MB maximum each · 20 documents maximum</p>
        <div className="mt-4 space-y-2">{loading ? <LoaderCircle className="h-5 w-5 animate-spin text-orange-600"/> : workspace?.contracts.length ? workspace.contracts.map((contract) => <div key={contract.id} className="flex items-center gap-2 rounded-lg bg-white p-3 ring-1 ring-slate-100"><button data-admin-read-action type="button" onClick={() => void view(contract)} className="min-w-0 flex-1 text-left"><p className="truncate text-sm font-bold text-slate-800">{contract.fileName}</p><p className="mt-0.5 text-xs text-slate-500">{fileSize(contract.sizeBytes)} · {contract.uploadedAt ? new Date(contract.uploadedAt).toLocaleDateString() : "Saved"}</p></button><button data-admin-write-action type="button" disabled={working} onClick={() => void remove(contract)} aria-label={`Delete ${contract.fileName}`} className="rounded-full p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4"/></button></div>) : <p className="py-5 text-center text-sm text-slate-500">No signed contract has been uploaded.</p>}</div>
        <p className="mt-4 text-sm font-bold text-slate-800">Current store commission: {commission}%</p><p className="text-xs text-slate-500">{workspace?.commission.source === "store_override" ? "Store-specific commission" : "Default marketplace commission"}</p>
      </div>
      <div className="min-h-72 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
        {previewUrl && selected ? <div className="flex h-full min-h-72 flex-col"><div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-2"><p className="truncate text-sm font-bold">{selected.fileName}</p><a href={previewUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-bold text-white">View full <ExternalLink className="h-3 w-3"/></a></div><iframe src={previewUrl} title={selected.fileName} className="min-h-72 flex-1 bg-white"/></div> : <div className="flex min-h-72 flex-col items-center justify-center p-6 text-center"><FileText className="h-9 w-9 text-slate-300"/><p className="mt-3 text-sm font-bold text-slate-700">Contract preview</p><p className="mt-1 text-xs text-slate-500">Select a saved contract to view it here.</p>{selected && <button data-admin-read-action type="button" onClick={() => void view(selected)} className="mt-4 rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white">View contract</button>}</div>}
      </div>
    </div>
  </section>;
}

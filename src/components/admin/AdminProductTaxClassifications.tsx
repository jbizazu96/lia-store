"use client";

import {useCallback, useEffect, useState} from "react";
import {BadgeDollarSign, LoaderCircle, Pencil, Plus, RefreshCw, Trash2, X} from "lucide-react";
import {useAdminAccess} from "@/context/AdminAccessContext";
import {useAdminConfirmation} from "@/context/AdminConfirmationContext";
import {adminWorkspaceClientService} from "@/services/admin/adminWorkspaceClientService";
import type {
  ProductTaxClassification,
  ProductTaxClassificationDraft,
} from "@/types/productTaxClassification";

const EMPTY_DRAFT: ProductTaxClassificationDraft = {
  id: "",
  name: "",
  description: "",
  stripeTaxCode: "",
  isActive: true,
  requiresStoreConfirmation: false,
};

function stableId(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function validDraft(draft: ProductTaxClassificationDraft): boolean {
  return /^[a-z0-9][a-z0-9-]{0,79}$/.test(draft.id) &&
    draft.name.trim().length >= 2 &&
    draft.description.trim().length >= 10 &&
    /^txcd_[0-9]{8}$/.test(draft.stripeTaxCode.trim().toLowerCase());
}

export function AdminProductTaxClassifications() {
  const {canWrite} = useAdminAccess();
  const writable = canWrite("product_categories");
  const confirm = useAdminConfirmation();
  const [classifications, setClassifications] = useState<ProductTaxClassification[]>([]);
  const [editingId, setEditingId] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState<ProductTaxClassificationDraft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [modalError, setModalError] = useState("");

  const load = useCallback(async () => {
    const result = await adminWorkspaceClientService.getProductTaxClassifications();
    setClassifications(result.classifications);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load()
      .catch((reason) => setError(
        reason instanceof Error ? reason.message : "Unable to load tax classifications."
      ))
      .finally(() => setLoading(false)));
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setModalError("");
  };

  const openEdit = (classification: ProductTaxClassification) => {
    setEditingId(classification.id);
    setDraft({...classification});
    setModalError("");
  };

  const close = () => {
    if (!working) {
      setEditingId(undefined);
      setDraft(EMPTY_DRAFT);
      setModalError("");
    }
  };

  const save = async () => {
    if (!validDraft(draft)) return;
    setWorking(true);
    setModalError("");
    setError("");
    setMessage("");
    try {
      if (editingId) {
        await adminWorkspaceClientService.updateProductTaxClassification(
          editingId,
          {
            name: draft.name,
            description: draft.description,
            stripeTaxCode: draft.stripeTaxCode,
            isActive: draft.isActive,
            requiresStoreConfirmation: draft.requiresStoreConfirmation,
          },
        );
        setMessage("Tax classification updated.");
      } else {
        await adminWorkspaceClientService.createProductTaxClassification(draft);
        setMessage("Tax classification created.");
      }
      await load();
      setEditingId(undefined);
      setDraft(EMPTY_DRAFT);
    } catch (reason) {
      setModalError(
        reason instanceof Error ? reason.message : "Unable to save the tax classification."
      );
    } finally {
      setWorking(false);
    }
  };

  const remove = async (classification: ProductTaxClassification) => {
    const approved = await confirm({
      title: "Delete tax classification?",
      description: `Delete ${classification.name}? Assigned classifications cannot be deleted and should be deactivated instead.`,
      confirmationLabel: "Delete classification",
      tone: "danger",
    });
    if (!approved) return;
    setWorking(true);
    setError("");
    setMessage("");
    try {
      await adminWorkspaceClientService.deleteProductTaxClassification(classification.id);
      await load();
      setMessage("Tax classification deleted.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to delete the tax classification."
      );
    } finally {
      setWorking(false);
    }
  };

  const applyMappings = async () => {
    const approved = await confirm({
      title: "Apply tax mappings to existing products?",
      description: "Unambiguous category defaults will be assigned. Products in unmapped or ambiguous categories will be made unavailable until a store confirms their classification.",
      confirmationLabel: "Apply mappings",
      tone: "warning",
    });
    if (!approved) return;
    setMigrating(true);
    setError("");
    setMessage("");
    let cursor: string | undefined;
    let scanned = 0;
    let classified = 0;
    let deactivated = 0;
    let reactivated = 0;
    let unchanged = 0;
    try {
      do {
        const result = await adminWorkspaceClientService.backfillProductTaxClassifications(cursor);
        scanned += result.scanned;
        classified += result.classified;
        deactivated += result.deactivated;
        reactivated += result.reactivated;
        unchanged += result.unchanged;
        cursor = result.nextCursor ?? undefined;
      } while (cursor);
      setMessage(`${scanned} products reviewed: ${classified} classified, ${reactivated} restored to the customer catalog, ${deactivated} made unavailable for store confirmation, and ${unchanged} already valid.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to apply the category tax mappings.");
    } finally {
      setMigrating(false);
    }
  };

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold tracking-wide text-orange-600">TAX CONFIGURATION</p>
          <h2 className="mt-1 text-2xl font-bold">Product tax classifications</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Maintain LIA&apos;s internal product-tax classifications and their Stripe Product Tax Codes. Stores will choose understandable classifications; raw Stripe codes remain controlled by LIA Admin.
          </p>
        </div>
        {writable && <div className="flex flex-wrap gap-2"><button type="button" disabled={migrating || working} onClick={() => void applyMappings()} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-700 ring-1 ring-slate-200 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${migrating ? "animate-spin" : ""}`} />{migrating ? "Applying…" : "Apply to existing products"}</button><button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4" />Add classification</button></div>}
      </div>

      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
      {message && <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">{message}</p>}

      {loading ? (
        <div className="mt-5 flex justify-center rounded-2xl bg-white p-10">
          <LoaderCircle className="h-6 w-6 animate-spin text-orange-600" />
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
          {classifications.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">
              No tax classifications configured. Add the first classification using a Stripe Product Tax Code.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {classifications.map((classification) => (
                <div key={classification.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <span className="rounded-xl bg-orange-50 p-2.5 text-orange-700">
                    <BadgeDollarSign className="h-5 w-5" />
                  </span>
                  <div className="min-w-60 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-900">{classification.name}</p>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${classification.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                        {classification.isActive ? "Active" : "Inactive"}
                      </span>
                      {classification.requiresStoreConfirmation && (
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">
                          Store confirmation required
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm leading-5 text-slate-600">{classification.description}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Stable ID: {classification.id} · Stripe: {classification.stripeTaxCode}
                    </p>
                  </div>
                  {writable && (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(classification)}
                        className="rounded-xl p-2 text-slate-600 hover:bg-slate-50"
                        aria-label={`Edit ${classification.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={working}
                        onClick={() => void remove(classification)}
                        className="rounded-xl p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
                        aria-label={`Delete ${classification.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editingId !== undefined && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-5" onClick={close}>
          <div role="dialog" aria-modal="true" aria-labelledby="tax-classification-title" onClick={(event) => event.stopPropagation()} className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="tax-classification-title" className="text-xl font-bold">
                  {editingId ? "Edit tax classification" : "Add tax classification"}
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  Verify the Product Tax Code in Stripe before making this classification available.
                </p>
              </div>
              <button type="button" onClick={close} className="rounded-full bg-slate-100 p-2 text-slate-600" aria-label="Close tax-classification editor">
                <X className="h-5 w-5" />
              </button>
            </div>

            {modalError && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{modalError}</p>}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-bold text-slate-700">
                Classification name
                <input
                  autoFocus
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                    id: editingId ? current.id : stableId(event.target.value),
                  }))}
                  maxLength={100}
                  placeholder="Unprepared grocery food"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5"
                />
              </label>
              <label className="text-sm font-bold text-slate-700">
                Stable ID
                <input
                  value={draft.id}
                  disabled={Boolean(editingId)}
                  onChange={(event) => setDraft((current) => ({...current, id: stableId(event.target.value)}))}
                  maxLength={80}
                  placeholder="unprepared-grocery-food"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 disabled:bg-slate-100 disabled:text-slate-500"
                />
              </label>
              <label className="text-sm font-bold text-slate-700 sm:col-span-2">
                Stripe Product Tax Code
                <input
                  value={draft.stripeTaxCode}
                  onChange={(event) => setDraft((current) => ({...current, stripeTaxCode: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 13)}))}
                  maxLength={13}
                  placeholder="txcd_99999999"
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono"
                />
                <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">
                  Stripe tax codes use txcd_ followed by eight digits.
                </span>
              </label>
              <label className="text-sm font-bold text-slate-700 sm:col-span-2">
                Store-facing description and examples
                <textarea
                  value={draft.description}
                  onChange={(event) => setDraft((current) => ({...current, description: event.target.value}))}
                  maxLength={500}
                  rows={4}
                  placeholder="Use for packaged grocery food sold for home preparation. Do not use for ready-to-eat meals."
                  className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5"
                />
              </label>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                <input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft((current) => ({...current, isActive: event.target.checked}))} className="mt-0.5 h-4 w-4 accent-orange-600" />
                <span><b>Active</b><span className="mt-1 block text-xs leading-5 text-slate-500">Available for future product classification.</span></span>
              </label>
              <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                <input type="checkbox" checked={draft.requiresStoreConfirmation} onChange={(event) => setDraft((current) => ({...current, requiresStoreConfirmation: event.target.checked}))} className="mt-0.5 h-4 w-4 accent-orange-600" />
                <span><b>Require store confirmation</b><span className="mt-1 block text-xs leading-5 text-slate-500">Use when a browsing category can have multiple tax treatments.</span></span>
              </label>
            </div>

            <button type="button" disabled={working || !validDraft(draft)} onClick={() => void save()} className="mt-5 w-full rounded-xl bg-orange-600 py-3 text-sm font-bold text-white disabled:opacity-50">
              {working ? "Saving…" : "Save classification"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

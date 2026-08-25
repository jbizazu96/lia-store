"use client";

import {useEffect, useState} from "react";
import Image from "next/image";
import {BellRing, Download, ImagePlus, ListTree, LoaderCircle, Pencil, Plus, Ruler, Trash2, X} from "lucide-react";
import {adminWorkspaceClientService} from "@/services/admin/adminWorkspaceClientService";
import {useAdminConfirmation} from "@/context/AdminConfirmationContext";

interface ProductCategoryItem {id: string; name: string; iconUrl: string; freshnessEligible: boolean}

export function AdminProductCategoriesWorkspace() {
  const [categories, setCategories] = useState<ProductCategoryItem[]>([]);
  const [editing, setEditing] = useState<ProductCategoryItem | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState("");
  const [freshnessEligible, setFreshnessEligible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    const result = await adminWorkspaceClientService.getProductCategories();
    setCategories(result.categories);
  };

  useEffect(() => {
    queueMicrotask(() => {
      void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load product categories.")).finally(() => setLoading(false));
    });
  }, []);

  const clearSelectedIcon = () => {
    if (iconPreview.startsWith("blob:")) URL.revokeObjectURL(iconPreview);
    setIconFile(null);
    setIconPreview("");
  };
  const openCreate = () => {clearSelectedIcon(); setEditing(null); setName(""); setFreshnessEligible(false); setError(""); setSuccess("");};
  const openEdit = (category: ProductCategoryItem) => {clearSelectedIcon(); setEditing(category); setName(category.name); setIconPreview(category.iconUrl); setFreshnessEligible(category.freshnessEligible); setError(""); setSuccess("");};
  const close = () => {if (!saving) {clearSelectedIcon(); setEditing(undefined); setName(""); setFreshnessEligible(false);}};
  const selectIcon = (file: File | undefined) => {
    if (!file) return;
    if (iconPreview.startsWith("blob:")) URL.revokeObjectURL(iconPreview);
    setIconFile(file);
    setIconPreview(URL.createObjectURL(file));
  };
  const save = async () => {
    if (name.trim().length < 2) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      if (editing) {
        await adminWorkspaceClientService.updateProductCategory(editing.id, {name: name.trim(), freshnessEligible});
        if (iconFile) await adminWorkspaceClientService.uploadProductCategoryIcon(editing.id, iconFile);
        setSuccess("Category renamed. Existing products remain assigned to it.");
      } else {
        const created = await adminWorkspaceClientService.createProductCategory({name: name.trim(), freshnessEligible});
        if (iconFile) await adminWorkspaceClientService.uploadProductCategoryIcon(created.id, iconFile);
        setSuccess("Product category created.");
      }
      await load(); clearSelectedIcon(); setEditing(undefined); setName(""); setFreshnessEligible(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save the category.");
    } finally {
      setSaving(false);
    }
  };
  const importExisting = async () => {
    setImporting(true); setError(""); setSuccess("");
    try {
      const result = await adminWorkspaceClientService.importProductCategories();
      await load();
      setSuccess(result.created > 0
        ? `${result.created} categories imported from ${result.productsScanned} existing products.`
        : "Every existing product category is already configured.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to import existing product categories.");
    } finally {
      setImporting(false);
    }
  };

  return <section>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold tracking-wide text-orange-600">STORE CATALOG</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Catalog management</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Control product categories, size units, and inventory-alert policy from one trusted workspace.</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={importing} onClick={() => void importExisting()} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-700 ring-1 ring-slate-200 disabled:opacity-50"><Download className="h-4 w-4" />{importing ? "Importing…" : "Import existing"}</button><button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4" />Add category</button></div></div>
    {error && <p className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
    {success && <p className="mt-4 rounded-xl border border-green-100 bg-green-50 p-3 text-sm font-semibold text-green-800">{success}</p>}
    <CatalogInventoryPolicy />
    {loading ? <div className="mt-6 flex justify-center rounded-2xl bg-white p-12"><LoaderCircle className="h-7 w-7 animate-spin text-orange-600" /></div> : <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">{categories.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">No categories have been configured. Import existing product category IDs or add the first category.</p> : <div className="divide-y divide-slate-100">{categories.map((category) => <div key={category.id} className="flex items-center gap-4 px-5 py-4"><span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-orange-50 text-orange-600">{category.iconUrl ? <Image src={category.iconUrl} alt="" fill sizes="40px" className="object-contain p-1" /> : <ListTree className="h-5 w-5" />}</span><div className="min-w-0 flex-1"><p className="font-bold text-slate-900">{category.name}</p><p className="mt-1 text-xs text-slate-400">Stable ID: {category.id}{category.freshnessEligible ? " · Freshness guarantee" : ""}</p></div><button type="button" onClick={() => openEdit(category)} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"><Pencil className="h-4 w-4" />Edit</button></div>)}</div>}</div>}
    <SizeUnitsManager />
    {editing !== undefined && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-5" onClick={close}><div role="dialog" aria-modal="true" aria-labelledby="category-editor-title" onClick={(event) => event.stopPropagation()} className="relative w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"><button type="button" onClick={close} className="absolute right-4 top-4 rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Close category editor"><X className="h-5 w-5" /></button><h2 id="category-editor-title" className="text-xl font-bold">{editing ? "Edit category" : "Add category"}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{editing ? "Display metadata can change while products keep the same stable category ID." : "The category will become available to store owners and customers."}</p><label className="mt-5 block text-sm font-bold text-slate-700">Category name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={100} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-2 focus:ring-orange-300" /></label><div className="mt-4"><p className="text-sm font-bold text-slate-700">Category image</p><label className="mt-2 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 p-3 hover:border-orange-400 hover:bg-orange-50/40"><span className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-500">{iconPreview ? <Image src={iconPreview} alt="Category image preview" fill sizes="64px" unoptimized={iconPreview.startsWith("blob:")} className="object-contain p-1" /> : <ImagePlus className="h-6 w-6" />}</span><span><b className="block text-sm text-slate-800">{iconPreview ? "Replace image" : "Choose image"}</b><span className="mt-1 block text-xs text-slate-500">JPG, PNG, WebP, or AVIF · up to 3 MB</span></span><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={(event) => selectIcon(event.target.files?.[0])} /></label></div><label className="mt-4 flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><input type="checkbox" checked={freshnessEligible} onChange={(event) => setFreshnessEligible(event.target.checked)} className="mt-0.5 h-4 w-4 accent-orange-600" /><span><b>Freshness guarantee</b><span className="mt-1 block text-xs leading-5 text-slate-500">Show freshness-guarantee messaging for products in this category.</span></span></label><button type="button" disabled={saving || name.trim().length < 2} onClick={() => void save()} className="mt-5 w-full rounded-xl bg-orange-600 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save category"}</button></div></div>}
  </section>;
}

function CatalogInventoryPolicy() {
  const [threshold, setThreshold] = useState("10");
  const [emailsPerDay, setEmailsPerDay] = useState("1");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    queueMicrotask(() => void adminWorkspaceClientService.getProductCatalogPolicy()
      .then((policy) => {
        setThreshold(String(policy.lowStockThreshold));
        setEmailsPerDay(String(policy.inventoryEmailsPerDay));
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load inventory-alert settings."))
      .finally(() => setLoading(false)));
  }, []);

  const save = async () => {
    const lowStockThreshold = Number(threshold);
    const inventoryEmailsPerDay = Number(emailsPerDay);
    if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0 || lowStockThreshold > 100_000) {
      setError("Enter a low-stock threshold from 0 to 100,000.");
      return;
    }
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await adminWorkspaceClientService.saveProductCatalogPolicy({lowStockThreshold, inventoryEmailsPerDay});
      setMessage(`Inventory policy saved. ${result.productsUpdated} existing products were synchronized.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save inventory-alert settings.");
    } finally {
      setSaving(false);
    }
  };

  return <section className="mt-7 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><div className="flex items-start gap-3"><span className="rounded-xl bg-orange-50 p-2.5 text-orange-700"><BellRing className="h-5 w-5" /></span><div><h2 className="font-bold text-slate-950">Inventory alerts</h2><p className="mt-1 text-sm leading-6 text-slate-500">This policy applies to every store. Store owners manage stock quantities but cannot change when LIA considers a product low in stock.</p></div></div>
    {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}{message && <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">{message}</p>}
    {loading ? <div className="mt-5 flex justify-center"><LoaderCircle className="h-6 w-6 animate-spin text-orange-600" /></div> : <div className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-sm font-bold text-slate-700">Low-stock threshold<input type="number" min="0" max="100000" step="1" value={threshold} onChange={(event) => setThreshold(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-200 px-3 py-2.5" /><span className="mt-1 block text-xs font-normal leading-5 text-slate-500">A positive stock quantity at or below this number is marked low stock.</span></label><label className="text-sm font-bold text-slate-700">Low-stock emails per day<select value={emailsPerDay} onChange={(event) => setEmailsPerDay(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"><option value="0">Disabled</option><option value="1">1 email per day</option><option value="2">2 emails per day</option><option value="3">3 emails per day</option><option value="4">4 emails per day</option></select><span className="mt-1 block text-xs font-normal leading-5 text-slate-500">Emails are consolidated by store and spread across daytime hours.</span></label></div>}
    {!loading && <button type="button" disabled={saving} onClick={() => void save()} className="mt-5 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save inventory policy"}</button>}
  </section>;
}

interface SizeUnitItem {id: string; label: string}

function SizeUnitsManager() {
  const confirm = useAdminConfirmation();
  const [units, setUnits] = useState<SizeUnitItem[]>([]);
  const [editing, setEditing] = useState<SizeUnitItem | null | undefined>(undefined);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => setUnits((await adminWorkspaceClientService.getProductSizeUnits()).units);
  useEffect(() => {
    queueMicrotask(() => void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load size units.")).finally(() => setLoading(false)));
  }, []);

  const close = () => {if (!working) {setEditing(undefined); setCode(""); setLabel("");}};
  const save = async () => {
    if (!code.trim() || !label.trim()) return;
    setWorking(true); setError(""); setMessage("");
    try {
      if (editing) await adminWorkspaceClientService.updateProductSizeUnit(editing.id, code.trim().toLowerCase(), label.trim());
      else await adminWorkspaceClientService.createProductSizeUnit({id: code.trim().toLowerCase(), label: label.trim()});
      await load(); close(); setEditing(undefined); setCode(""); setLabel("");
      setMessage(editing ? "Size unit updated across active products and saved carts." : "Size unit added for store product forms.");
    } catch (reason) {setError(reason instanceof Error ? reason.message : "Unable to save the size unit.");}
    finally {setWorking(false);}
  };
  const importExisting = async () => {
    setWorking(true); setError(""); setMessage("");
    try {
      const result = await adminWorkspaceClientService.importProductSizeUnits();
      await load();
      setMessage(result.created ? `${result.created} size units imported after scanning ${result.productsScanned} products.` : "All existing size units are already configured.");
    } catch (reason) {setError(reason instanceof Error ? reason.message : "Unable to import size units.");}
    finally {setWorking(false);}
  };
  const remove = async (unit: SizeUnitItem) => {
    if (!await confirm({title: "Remove size unit?", description: `Remove ${unit.label} from future product forms? Existing products keep the saved unit.`, confirmationLabel: "Remove unit", tone: "danger"})) return;
    setWorking(true); setError(""); setMessage("");
    try {await adminWorkspaceClientService.deleteProductSizeUnit(unit.id); await load(); setMessage("Size unit removed. Existing products were not changed.");}
    catch (reason) {setError(reason instanceof Error ? reason.message : "Unable to remove the size unit.");}
    finally {setWorking(false);}
  };

  return <section className="mt-10"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold tracking-wide text-orange-600">PRODUCT OPTIONS</p><h2 className="mt-1 text-2xl font-bold">Size units</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Control the units available when stores add or edit products. Unit codes remain stable; editing changes the label everywhere. Removing a unit affects future selections only.</p></div><div className="flex gap-2"><button type="button" disabled={working} onClick={() => void importExisting()} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-700 ring-1 ring-slate-200 disabled:opacity-50"><Download className="h-4 w-4" />Import existing</button><button type="button" onClick={() => {setEditing(null); setCode(""); setLabel("");}} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4" />Add size unit</button></div></div>
    {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}{message && <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-800">{message}</p>}
    {loading ? <div className="mt-5 flex justify-center rounded-2xl bg-white p-10"><LoaderCircle className="h-6 w-6 animate-spin text-orange-600" /></div> : <div className="mt-5 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">{units.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No size units configured. Import the existing defaults to begin.</p> : <div className="divide-y divide-slate-100">{units.map((unit) => <div key={unit.id} className="flex items-center gap-4 px-5 py-4"><span className="rounded-xl bg-orange-50 p-2.5 text-orange-600"><Ruler className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="font-bold">{unit.label}</p><p className="mt-1 text-xs text-slate-400">Stable code: {unit.id}</p></div><button type="button" onClick={() => {setEditing(unit); setCode(unit.id); setLabel(unit.label);}} className="rounded-xl p-2 text-slate-600 hover:bg-slate-50" aria-label={`Edit ${unit.label}`}><Pencil className="h-4 w-4" /></button><button type="button" disabled={working} onClick={() => void remove(unit)} className="rounded-xl p-2 text-red-600 hover:bg-red-50 disabled:opacity-50" aria-label={`Delete ${unit.label}`}><Trash2 className="h-4 w-4" /></button></div>)}</div>}</div>}
    {editing !== undefined && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-5" onClick={close}><div role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()} className="relative w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"><button type="button" onClick={close} className="absolute right-4 top-4 rounded-full bg-slate-100 p-2 text-slate-600" aria-label="Close size-unit editor"><X className="h-5 w-5" /></button><h3 className="text-xl font-bold">{editing ? "Edit size unit" : "Add size unit"}</h3><p className="mt-2 text-sm text-slate-500">Changing the code updates active products, customer catalog profiles, and saved carts. Completed orders retain their original purchased unit.</p><label className="mt-5 block text-sm font-bold">Unit code<input autoFocus={!editing} value={code} onChange={(event) => setCode(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} maxLength={20} placeholder="e.g., case" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label><label className="mt-4 block text-sm font-bold">Display label<input autoFocus={Boolean(editing)} value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} placeholder="e.g., Case" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5" /></label><button type="button" disabled={working || !code.trim() || !label.trim()} onClick={() => void save()} className="mt-5 w-full rounded-xl bg-orange-600 py-3 text-sm font-bold text-white disabled:opacity-50">{working ? "Saving…" : "Save size unit"}</button></div></div>}
  </section>;
}

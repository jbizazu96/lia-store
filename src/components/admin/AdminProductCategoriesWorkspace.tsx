"use client";

import {useEffect, useState} from "react";
import Image from "next/image";
import {Download, ImagePlus, ListTree, LoaderCircle, Pencil, Plus, X} from "lucide-react";
import {adminWorkspaceClientService} from "@/services/admin/adminWorkspaceClientService";

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
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold tracking-wide text-orange-600">STORE CATALOG</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Product categories</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Firestore is the single category source for stores and customers. Category IDs remain unchanged, so renaming never removes or detaches existing products.</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={importing} onClick={() => void importExisting()} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-700 ring-1 ring-slate-200 disabled:opacity-50"><Download className="h-4 w-4" />{importing ? "Importing…" : "Import existing"}</button><button type="button" onClick={openCreate} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4" />Add category</button></div></div>
    {error && <p className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
    {success && <p className="mt-4 rounded-xl border border-green-100 bg-green-50 p-3 text-sm font-semibold text-green-800">{success}</p>}
    {loading ? <div className="mt-6 flex justify-center rounded-2xl bg-white p-12"><LoaderCircle className="h-7 w-7 animate-spin text-orange-600" /></div> : <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">{categories.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">No categories have been configured. Import existing product category IDs or add the first category.</p> : <div className="divide-y divide-slate-100">{categories.map((category) => <div key={category.id} className="flex items-center gap-4 px-5 py-4"><span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-orange-50 text-orange-600">{category.iconUrl ? <Image src={category.iconUrl} alt="" fill sizes="40px" className="object-contain p-1" /> : <ListTree className="h-5 w-5" />}</span><div className="min-w-0 flex-1"><p className="font-bold text-slate-900">{category.name}</p><p className="mt-1 text-xs text-slate-400">Stable ID: {category.id}{category.freshnessEligible ? " · Freshness guarantee" : ""}</p></div><button type="button" onClick={() => openEdit(category)} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"><Pencil className="h-4 w-4" />Edit</button></div>)}</div>}</div>}
    {editing !== undefined && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-5" onClick={close}><div role="dialog" aria-modal="true" aria-labelledby="category-editor-title" onClick={(event) => event.stopPropagation()} className="relative w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"><button type="button" onClick={close} className="absolute right-4 top-4 rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Close category editor"><X className="h-5 w-5" /></button><h2 id="category-editor-title" className="text-xl font-bold">{editing ? "Edit category" : "Add category"}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{editing ? "Display metadata can change while products keep the same stable category ID." : "The category will become available to store owners and customers."}</p><label className="mt-5 block text-sm font-bold text-slate-700">Category name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={100} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-2 focus:ring-orange-300" /></label><div className="mt-4"><p className="text-sm font-bold text-slate-700">Category image</p><label className="mt-2 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 p-3 hover:border-orange-400 hover:bg-orange-50/40"><span className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-500">{iconPreview ? <Image src={iconPreview} alt="Category image preview" fill sizes="64px" unoptimized={iconPreview.startsWith("blob:")} className="object-contain p-1" /> : <ImagePlus className="h-6 w-6" />}</span><span><b className="block text-sm text-slate-800">{iconPreview ? "Replace image" : "Choose image"}</b><span className="mt-1 block text-xs text-slate-500">JPG, PNG, WebP, or AVIF · up to 3 MB</span></span><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="sr-only" onChange={(event) => selectIcon(event.target.files?.[0])} /></label></div><label className="mt-4 flex items-start gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><input type="checkbox" checked={freshnessEligible} onChange={(event) => setFreshnessEligible(event.target.checked)} className="mt-0.5 h-4 w-4 accent-orange-600" /><span><b>Freshness guarantee</b><span className="mt-1 block text-xs leading-5 text-slate-500">Show freshness-guarantee messaging for products in this category.</span></span></label><button type="button" disabled={saving || name.trim().length < 2} onClick={() => void save()} className="mt-5 w-full rounded-xl bg-orange-600 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save category"}</button></div></div>}
  </section>;
}

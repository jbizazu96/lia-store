"use client";

import {useEffect, useState} from "react";
import {Pencil, Plus, Trash2, Users, X} from "lucide-react";
import {storeStaffClientService, type StoreStaffPermissions, type StoreStaffUser} from "@/services/store/storeStaffClientService";
import {useConfirmation} from "@/context/ConfirmationContext";
import {useSuccessToast} from "@/context/SuccessToastContext";

const emptyDraft = {uid: "", displayName: "", email: "", password: "", isActive: true, permissions: {} as StoreStaffPermissions};

export function StoreStaffSection() {
  const [users, setUsers] = useState<StoreStaffUser[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const {confirm} = useConfirmation();
  const {showSuccess} = useSuccessToast();
  const load = async () => {
    try {setLoading(true); setUsers((await storeStaffClientService.list()).users); setError("");}
    catch (reason) {setError(reason instanceof Error ? reason.message : "Staff accounts could not be loaded.");}
    finally {setLoading(false);}
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial callable load intentionally hydrates this owner-only panel
  useEffect(() => {void load();}, []);
  const setPermission = (page: "orders" | "products", level: "none" | "read" | "write") => setDraft((current) => {
    const next = {...current.permissions};
    if (level === "none") delete next[page]; else next[page] = level;
    return {...current, permissions: next};
  });
  const save = async () => {
    if (!draft.permissions.orders && !draft.permissions.products) {setError("Select at least one page."); return;}
    try {
      setSaving(true); setError("");
      if (draft.uid) await storeStaffClientService.update({uid: draft.uid, displayName: draft.displayName, isActive: draft.isActive, permissions: draft.permissions});
      else await storeStaffClientService.create({displayName: draft.displayName, email: draft.email, password: draft.password, permissions: draft.permissions});
      setOpen(false); setDraft(emptyDraft); await load(); showSuccess(draft.uid ? "Staff access updated." : "Staff account created.");
    } catch (reason) {setError(reason instanceof Error ? reason.message : "Staff access could not be saved.");}
    finally {setSaving(false);}
  };
  const remove = async (user: StoreStaffUser) => {
    if (!await confirm({title: "Delete staff account?", message: `${user.displayName} will immediately lose access. This cannot be undone.`, confirmLabel: "Delete account", cancelLabel: "Keep account", destructive: true})) return;
    try {await storeStaffClientService.remove(user.uid); await load(); showSuccess("Staff account deleted.");}
    catch (reason) {setError(reason instanceof Error ? reason.message : "Staff account could not be deleted.");}
  };
  return <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Users className="h-5 w-5 text-orange-600"/><h2 className="text-lg font-bold text-slate-900">User administration</h2></div><p className="mt-1 max-w-2xl text-sm text-slate-500">Give employees read-only or editing access to Orders and Products. Financials, contracts, settings, account deletion, and staff administration always remain owner-only.</p></div><button type="button" onClick={() => {setError(""); setDraft(emptyDraft); setOpen(true);}} className="inline-flex items-center gap-2 rounded-full bg-orange-600 px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4"/>Add staff user</button></div>
    {!open && error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="mt-5 space-y-3">{loading ? <p className="text-sm text-slate-500">Loading staff accounts…</p> : users.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No staff accounts yet.</p> : users.map((user) => <div key={user.uid} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 p-4"><div><p className="font-bold text-slate-900">{user.displayName}</p><p className="text-sm text-slate-500">{user.email}</p><p className="mt-1 text-xs font-semibold text-slate-500">{Object.entries(user.permissions).map(([page, level]) => `${page}: ${level}`).join(" · ")} · {user.isActive ? "Active" : "Disabled"}</p></div><div className="flex gap-2"><button type="button" aria-label={`Edit ${user.displayName}`} onClick={() => {setDraft({...emptyDraft, ...user, password: ""}); setOpen(true);}} className="rounded-full border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><Pencil className="h-4 w-4"/></button><button type="button" aria-label={`Delete ${user.displayName}`} onClick={() => void remove(user)} className="rounded-full border border-red-100 p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4"/></button></div></div>)}</div>
    {open && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true"><div className="w-full max-w-lg rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"><div className="flex items-center justify-between"><h3 className="text-lg font-black">{draft.uid ? "Edit staff user" : "Add staff user"}</h3><button type="button" onClick={() => {setError(""); setOpen(false);}} className="rounded-full bg-slate-100 p-2"><X className="h-4 w-4"/></button></div><div className="mt-5 space-y-4"><label className="block text-sm font-bold">Name<input value={draft.displayName} onChange={(event) => setDraft({...draft, displayName: event.target.value})} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal"/></label>{!draft.uid && <><label className="block text-sm font-bold">Email<input type="email" value={draft.email} onChange={(event) => setDraft({...draft, email: event.target.value})} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal"/></label><label className="block text-sm font-bold">Temporary password<input type="password" value={draft.password} onChange={(event) => setDraft({...draft, password: event.target.value})} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal"/><span className="mt-1 block text-xs font-normal text-slate-500">12+ characters with uppercase, lowercase, number, and special character.</span></label></>}{(["orders", "products"] as const).map((page) => <label key={page} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3"><span className="font-bold capitalize">{page}</span><select value={draft.permissions[page] ?? "none"} onChange={(event) => setPermission(page, event.target.value as "none" | "read" | "write")} className="rounded-lg border border-slate-200 px-3 py-2"><option value="none">No access</option><option value="read">Read only</option><option value="write">Read & write</option></select></label>)}{draft.uid && <label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({...draft, isActive: event.target.checked})}/>Account active</label>}</div>{error && <p role="alert" aria-live="polite" className="mt-4 rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>}<button type="button" disabled={saving} onClick={() => void save()} className="mt-6 w-full rounded-full bg-orange-600 px-5 py-3 font-bold text-white disabled:opacity-50">{saving ? "Saving…" : draft.uid ? "Save access" : "Create staff account"}</button></div></div>}
  </section>;
}

"use client";

import {useEffect, useState} from "react";
import {LoaderCircle, Plus, ShieldCheck, Trash2, UserCog, X} from "lucide-react";
import {adminUserClientService} from "@/services/admin/adminUserClientService";
import {
  ADMIN_PERMISSIONS,
  ADMIN_PERMISSION_LABELS,
  type AdminAccessLevel,
  type AdminPermission,
  type AdminPermissions,
  type ManagedAdminUser,
} from "@/types/adminAccess";

type Draft = {displayName: string; email: string; password: string; permissions: AdminPermissions};
const emptyDraft: Draft = {displayName: "", email: "", password: "", permissions: {}};

function date(value: string | null): string {
  return value ? new Intl.DateTimeFormat("en-US", {dateStyle: "medium", timeStyle: "short"}).format(new Date(value)) : "Never";
}

function setPermission(
  selected: AdminPermissions,
  permission: AdminPermission,
  access: AdminAccessLevel | "none",
): AdminPermissions {
  const next = {...selected};
  if (access === "none") delete next[permission];
  else next[permission] = access;
  return next;
}

export function AdminUsersWorkspace() {
  const [users, setUsers] = useState<ManagedAdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState<ManagedAdminUser | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try { setUsers((await adminUserClientService.list()).users); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load admin users."); }
    finally { setLoading(false); }
  };
  useEffect(() => { queueMicrotask(() => void load()); }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setWorking("create"); setError(""); setMessage("");
    try {
      await adminUserClientService.create(draft);
      setDraft(emptyDraft); setShowCreate(false); setMessage("Staff administrator created."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to create the administrator."); }
    finally { setWorking(null); }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!editing) return; setWorking(editing.uid); setError(""); setMessage("");
    try {
      await adminUserClientService.update({uid: editing.uid, displayName: editing.displayName, permissions: editing.permissions, isActive: editing.isActive});
      setEditing(null); setMessage("Administrator access updated. Existing sessions were revoked."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update the administrator."); }
    finally { setWorking(null); }
  };

  const remove = async (user: ManagedAdminUser) => {
    if (!window.confirm(`Delete ${user.email}? This removes their Firebase Authentication account and admin access.`)) return;
    setWorking(user.uid); setError(""); setMessage("");
    try { await adminUserClientService.delete(user.uid); setMessage("Staff administrator deleted."); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to delete the administrator."); }
    finally { setWorking(null); }
  };

  if (loading) return <div className="flex min-h-72 items-center justify-center"><LoaderCircle className="h-8 w-8 animate-spin text-orange-600" /></div>;
  return <section>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold tracking-wide text-orange-600">MASTER ADMIN ONLY</p><h1 className="mt-1 text-3xl font-bold">Admin users</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Create staff administrators and control exactly which admin areas they can open. Staff can never manage other admin users.</p></div><button type="button" onClick={() => {setDraft(emptyDraft); setShowCreate(true);}} className="inline-flex items-center gap-2 rounded-full bg-orange-600 px-5 py-3 text-sm font-bold text-white"><Plus className="h-4 w-4" />Add admin user</button></div>
    {error && <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}
    {message && <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{message}</p>}
    <div className="mt-6 grid gap-4">{users.map((user) => <article key={user.uid} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-50 text-orange-700">{user.role === "master_admin" ? <ShieldCheck className="h-5 w-5" /> : <UserCog className="h-5 w-5" />}</span><div><h2 className="font-bold text-slate-900">{user.displayName || "Administrator"}</h2><p className="text-sm text-slate-500">{user.email}</p><p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{user.role === "master_admin" ? "Master administrator" : user.isActive ? "Active staff administrator" : "Disabled staff administrator"}</p></div></div>{user.role !== "master_admin" && <div className="flex gap-2"><button type="button" onClick={() => setEditing({...user})} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">Edit</button><button type="button" disabled={working === user.uid} onClick={() => void remove(user)} className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-700 disabled:opacity-50" aria-label={`Delete ${user.email}`}><Trash2 className="h-4 w-4" /></button></div>}</div><div className="mt-4 flex flex-wrap gap-2">{user.role === "master_admin" ? <span className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-700">All admin areas · Read and write</span> : Object.entries(user.permissions).map(([permission, access]) => <span key={permission} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${access === "write" ? "bg-orange-50 text-orange-700" : "bg-slate-100 text-slate-600"}`}>{ADMIN_PERMISSION_LABELS[permission as AdminPermission]} · {access}</span>)}</div><p className="mt-4 text-xs text-slate-400">Created {date(user.createdAt)} · Last workspace access {date(user.lastWorkspaceAccessAt)}</p></article>)}</div>
    {(showCreate || editing) && <div className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center sm:p-5" onClick={() => {setShowCreate(false); setEditing(null);}}><form onSubmit={editing ? save : create} onClick={(event) => event.stopPropagation()} className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-[32px] bg-white p-6 shadow-2xl sm:rounded-[32px]"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">{editing ? "Edit administrator" : "Add administrator"}</h2><p className="mt-1 text-sm text-slate-500">Choose read-only or read-and-write access for each admin area.</p></div><button type="button" onClick={() => {setShowCreate(false); setEditing(null);}} className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-700"><X className="h-5 w-5" /></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold text-slate-700">Name<input required minLength={2} value={editing?.displayName ?? draft.displayName} onChange={(event) => editing ? setEditing({...editing, displayName: event.target.value}) : setDraft({...draft, displayName: event.target.value})} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-orange-400" /></label>{!editing && <><label className="text-sm font-bold text-slate-700">Email<input required type="email" value={draft.email} onChange={(event) => setDraft({...draft, email: event.target.value})} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-orange-400" /></label><label className="text-sm font-bold text-slate-700 sm:col-span-2">Temporary password<input required type="password" minLength={12} value={draft.password} onChange={(event) => setDraft({...draft, password: event.target.value})} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-medium outline-none focus:border-orange-400" /><span className="mt-1 block text-xs font-normal text-slate-500">At least 12 characters with uppercase, lowercase, and a number. The password is sent only to Firebase Authentication and is never stored in Firestore.</span></label></>}{editing && <label className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-700 sm:col-span-2"><input type="checkbox" checked={editing.isActive} onChange={(event) => setEditing({...editing, isActive: event.target.checked})} className="h-4 w-4" />Account active</label>}</div><fieldset className="mt-5"><legend className="text-sm font-bold text-slate-700">Page privileges</legend><div className="mt-3 grid gap-2">{ADMIN_PERMISSIONS.map((permission) => {const selected = editing?.permissions ?? draft.permissions; const access = selected[permission] ?? "none"; return <div key={permission} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><span className="text-sm font-semibold text-slate-700">{ADMIN_PERMISSION_LABELS[permission]}</span><div className="flex rounded-full bg-slate-100 p-1">{(["none", "read", "write"] as const).map((level) => <button key={level} type="button" onClick={() => editing ? setEditing({...editing, permissions: setPermission(editing.permissions, permission, level)}) : setDraft({...draft, permissions: setPermission(draft.permissions, permission, level)})} className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${access === level ? "bg-white text-orange-700 shadow-sm" : "text-slate-500"}`}>{level}</button>)}</div></div>;})}</div></fieldset><button type="submit" disabled={working !== null} className="mt-6 w-full rounded-full bg-orange-600 py-3.5 text-sm font-bold text-white disabled:opacity-50">{working ? "Saving…" : editing ? "Save permissions" : "Create administrator"}</button></form></div>}
  </section>;
}

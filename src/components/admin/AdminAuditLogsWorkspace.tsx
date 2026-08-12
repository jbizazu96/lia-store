"use client";

/*
|--------------------------------------------------------------------------
| Admin Audit Logs Workspace
|--------------------------------------------------------------------------
|
| Administrative history is shown from a protected callable, not from a
| client Firestore listener. Details are safe compact summaries only.
|
*/

import {
  useEffect,
  useState,
} from "react";
import {
  ArrowLeft,
  History,
  LoaderCircle,
  Search,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import {
  adminWorkspaceClientService,
} from "@/services/admin/adminWorkspaceClientService";
import type {
  AdminAuditLog,
} from "@/types/adminWorkspace";

function displayDate(value: string | null): string {
  return value
    ? new Date(value).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    : "Timestamp pending";
}

function label(value: string): string {
  return value.replace(/[._]/g, " ");
}

export function AdminAuditLogsWorkspace() {
  const [search, setSearch] = useState("");
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [limited, setLimited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      void adminWorkspaceClientService.getAuditLogs(search)
        .then((result) => {
          setLogs(result.logs);
          setLimited(result.limited);
        })
        .catch((reason: unknown) => setError(
          reason instanceof Error ? reason.message : "Unable to load audit history."
        ))
        .finally(() => setLoading(false));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [search]);

  return <section><Link href="/admin/settings" className="mb-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-700 ring-1 ring-slate-200"><ArrowLeft className="h-4 w-4" />Back to settings</Link><p className="text-sm font-bold tracking-wide text-orange-600">SECURITY & GOVERNANCE</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Admin audit logs</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Review immutable records of administrator decisions and platform-policy changes. Sensitive documents, addresses, and payment secrets are intentionally excluded.</p>
    <label className="relative mt-6 block max-w-xl"><Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search actions, admins, targets, or reasons" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm font-medium outline-none focus:ring-2 focus:ring-orange-300" /></label>
    {limited && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Showing the latest 100 audit events. Use search to narrow the current operational window.</p>}
    {error && <p className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {loading ? <Loading /> : <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">{logs.length === 0 ? <div className="p-10 text-center"><History className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm text-slate-500">No audit events match this search.</p></div> : <div className="divide-y divide-slate-100">{logs.map((log) => <article key={log.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 gap-3"><span className="rounded-xl bg-orange-50 p-2.5 text-orange-700"><ShieldCheck className="h-5 w-5" /></span><div><p className="font-bold capitalize">{label(log.action)}</p><p className="mt-1 text-sm text-slate-500">{log.actor.displayName ? `${log.actor.displayName} · ` : ""}{log.actor.email} · {label(log.actor.role)}</p></div></div><p className="text-xs font-medium text-slate-400">{displayDate(log.createdAt)}</p></div><div className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-600"><b className="text-slate-900">Target:</b> {label(log.target.type)} · <span className="font-mono text-xs">{log.target.id}</span></p>{log.reason && <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900"><b>Reason:</b> {log.reason}</p>}</div>{Object.keys(log.details).length > 0 && <div className="mt-3 flex flex-wrap gap-2">{Object.entries(log.details).map(([key, value]) => <span key={key} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{label(key)}: {String(value)}</span>)}</div>}</article>)}</div>}</div>}
  </section>;
}

function Loading() { return <div className="mt-6 flex justify-center rounded-2xl bg-white p-12"><LoaderCircle className="h-7 w-7 animate-spin text-orange-600" /></div>; }

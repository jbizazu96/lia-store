"use client";

import {AlertTriangle, X} from "lucide-react";

export function AdminConfirmDialog({open, title, description, confirmationLabel = "Confirm", tone = "danger", busy = false, onCancel, onConfirm}: {open: boolean; title: string; description: string; confirmationLabel?: string; tone?: "danger" | "warning" | "primary"; busy?: boolean; onCancel: () => void; onConfirm: () => void}) {
  if (!open) return null;
  const color = tone === "danger" ? "bg-red-600" : tone === "warning" ? "bg-amber-600" : "bg-orange-600";
  return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-5" role="presentation"><section role="alertdialog" aria-modal="true" aria-labelledby="admin-confirm-title" className="w-full max-w-lg rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"><div className="flex items-start gap-3"><span className="rounded-xl bg-amber-50 p-2.5 text-amber-700"><AlertTriangle className="h-5 w-5"/></span><div className="min-w-0 flex-1"><h2 id="admin-confirm-title" className="text-lg font-black">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p></div><button data-admin-read-action type="button" onClick={onCancel} className="rounded-full bg-slate-100 p-2" aria-label="Close confirmation"><X className="h-4 w-4"/></button></div><div className="mt-6 grid grid-cols-2 gap-3"><button data-admin-read-action type="button" disabled={busy} onClick={onCancel} className="rounded-full border border-slate-200 px-4 py-2.5 text-sm font-bold">Cancel</button><button type="button" disabled={busy} onClick={onConfirm} className={`${color} rounded-full px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50`}>{busy ? "Working…" : confirmationLabel}</button></div></section></div>;
}

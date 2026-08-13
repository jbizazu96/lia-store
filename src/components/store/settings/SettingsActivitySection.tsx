"use client";

import {useEffect, useState} from "react";
import {History, RotateCcw} from "lucide-react";
import {storeWorkspaceClientService, type StoreSettingsAuditEntry} from "@/services/store/storeWorkspaceClientService";

function actionLabel(action: string): string {
  return action.replace(/^settings_/, "").replace(/_updated$/, " updated").replaceAll("_", " ");
}

export function SettingsActivitySection() {
  const [entries, setEntries] = useState<StoreSettingsAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try { setEntries((await storeWorkspaceClientService.getSettingsAudit()).entries); }
    catch { setError("Settings activity could not be loaded."); }
    finally { setLoading(false); }
  };

  useEffect(() => { queueMicrotask(() => void load()); }, []);

  return <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
    <div className="flex items-center gap-3"><History className="h-5 w-5 text-gray-400" /><div><h3 className="font-bold text-gray-800">Settings activity</h3><p className="text-xs text-gray-500">The 25 most recent settings changes made by this store account.</p></div></div>
    {loading ? <p className="mt-5 text-sm text-gray-500">Loading activity…</p> : error ? <div className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}<button type="button" onClick={() => void load()} className="ml-3 inline-flex items-center gap-1 font-bold"><RotateCcw className="h-3.5 w-3.5" />Retry</button></div> : entries.length === 0 ? <p className="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">No settings activity has been recorded yet.</p> : <ol className="mt-5 divide-y divide-gray-100">{entries.map((entry) => <li key={entry.id} className="py-3"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold capitalize text-gray-800">{actionLabel(entry.action)}</p><p className="mt-1 text-xs text-gray-500">{entry.changedFields.length ? entry.changedFields.join(", ") : "No field changes"}</p></div><time className="shrink-0 text-xs text-gray-400">{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "Pending"}</time></div></li>)}</ol>}
  </section>;
}

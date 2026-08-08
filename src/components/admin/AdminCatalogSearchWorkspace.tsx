"use client";

import {useState} from "react";
import {ArrowLeft, DatabaseZap, LoaderCircle} from "lucide-react";
import Link from "next/link";
import {adminWorkspaceClientService} from "@/services/admin/adminWorkspaceClientService";

export function AdminCatalogSearchWorkspace() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const rebuild = async () => {
    setRunning(true);
    setError("");
    setResult("");
    let afterStoreId: string | undefined;
    let storesProcessed = 0;

    try {
      do {
        const page = await adminWorkspaceClientService.reindexCatalogSearch(afterStoreId);
        storesProcessed += page.storesProcessed;
        afterStoreId = page.nextAfterStoreId ?? undefined;
      } while (afterStoreId);

      setResult(`Rebuilt public search profiles for ${storesProcessed} store${storesProcessed === 1 ? "" : "s"}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to rebuild the catalog search index.");
    } finally {
      setRunning(false);
    }
  };

  return <section className="max-w-2xl"><Link href="/admin/settings" className="mb-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-700 ring-1 ring-slate-200"><ArrowLeft className="h-4 w-4"/>Back to settings</Link><p className="text-sm font-bold tracking-wide text-orange-600">CATALOG OPERATIONS</p><h1 className="mt-1 text-3xl font-bold">Public search index</h1><p className="mt-2 text-sm leading-6 text-slate-600">Rebuild customer-safe store and product search profiles after introducing new search fields. This updates only public projections and records the operation in audit logs.</p>{error&&<p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{result&&<p className="mt-5 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-800">{result}</p>}<section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><div className="flex gap-4"><div className="rounded-xl bg-orange-50 p-3 text-orange-700"><DatabaseZap className="h-5 w-5"/></div><div><h2 className="font-bold">Rebuild catalog search</h2><p className="mt-1 text-sm leading-5 text-slate-500">Existing public profiles receive search tokens and the safe store summary used by product search. Customers never read private catalog documents.</p><button disabled={running} onClick={()=>void rebuild()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{running&&<LoaderCircle className="h-4 w-4 animate-spin"/>}{running?"Rebuilding…":"Rebuild public search index"}</button></div></div></section></section>;
}

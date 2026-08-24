"use client";

/*
|--------------------------------------------------------------------------
| Admin Finance Workspace
|--------------------------------------------------------------------------
|
| Shows trusted settlement, transfer, and refund records only. The page does
| not initiate a Stripe action or expose Stripe account identifiers.
|
*/

import {useEffect, useState} from "react";
import {AlertTriangle, Banknote, CircleDollarSign, LoaderCircle, RotateCcw} from "lucide-react";
import {adminWorkspaceClientService} from "@/services/admin/adminWorkspaceClientService";
import type {AdminFinanceOverview} from "@/types/adminWorkspace";

type Tab = "transfers" | "settlements" | "refunds";
const label = (value: string) => value.replace(/_/g, " ");
const cash = (amount: number, currency = "usd") => new Intl.NumberFormat("en-US", {style: "currency", currency: currency.toUpperCase()}).format(amount / 100);
const displayDate = (value: string | null) => value ? new Date(value).toLocaleString("en-US", {month: "short", day: "numeric", hour: "numeric", minute: "2-digit"}) : "—";

export function AdminFinanceWorkspace() {
  const [data, setData] = useState<AdminFinanceOverview | null>(null);
  const [tab, setTab] = useState<Tab>("transfers");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = async () => { try { setLoading(true); setError(""); setData(await adminWorkspaceClientService.getFinanceOverview()); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load financial records."); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  if (loading) return <div className="flex min-h-64 items-center justify-center"><LoaderCircle className="h-8 w-8 animate-spin text-orange-600"/></div>;
  if (error || !data) return <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700"><p>{error || "Financial records are unavailable."}</p><button data-admin-read-action type="button" onClick={() => void load()} className="mt-3 rounded-full bg-red-700 px-4 py-2 font-bold text-white">Try again</button></div>;
  const matches = (...values: Array<string | null>) => { const query = search.trim().toLowerCase(); return !query || values.some((value) => (value ?? "").toLowerCase().includes(query)); };
  const transfers = data.transfers.filter((item) => matches(item.orderNumber, item.orderId, item.recipientType, item.status, item.recipientId));
  const refunds = data.refunds.filter((item) => matches(item.orderNumber, item.orderId, item.scope, item.reason, item.status));
  const settlements = data.settlements.filter((item) => matches(item.orderNumber, item.orderId, item.status));
  return <section><div><p className="text-sm font-bold tracking-wide text-orange-600">FINANCE</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Payouts, transfers & refunds</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Read-only financial oversight. Transfer obligations are created after delivery; Stripe processing remains in the protected backend.</p></div>
    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={<Banknote/>} label="Completed payouts" value={cash(data.metrics.completedTransferAmount)} tone="text-green-700 bg-green-50"/><Metric icon={<CircleDollarSign/>} label="Pending payouts" value={cash(data.metrics.pendingTransferAmount)} tone="text-blue-700 bg-blue-50"/><Metric icon={<AlertTriangle/>} label="Failed transfers" value={String(data.metrics.failedTransfers)} tone="text-red-700 bg-red-50"/><Metric icon={<RotateCcw/>} label="Pending refunds" value={String(data.metrics.pendingRefunds)} tone="text-amber-800 bg-amber-50"/></div>
    <div className="mt-7 flex flex-wrap gap-2">{(["transfers", "settlements", "refunds"] as Tab[]).map((value) => <button data-admin-read-action key={value} type="button" onClick={() => setTab(value)} className={"rounded-full px-4 py-2 text-sm font-bold capitalize " + (tab === value ? "bg-orange-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>{value}</button>)}</div>
    <label className="mt-5 block max-w-lg text-sm font-bold text-slate-700">Search finance records<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order number, type, status, recipient…" className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-medium"/></label>
    <section className="mt-5 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">{tab === "transfers" && <div className="divide-y divide-slate-100">{transfers.length === 0 ? <Empty/> : transfers.map((item) => <Row key={item.id} title={item.recipientType + " payout"} subtitle={"Order #" + (item.orderNumber || "Unavailable") + " · " + displayDate(item.updatedAt)} amount={cash(item.amount, item.currency)} status={item.status} note={item.lastError ? "Latest failure: " + item.lastError : item.attemptCount > 1 ? item.attemptCount + " attempts" : ""}/>)}</div>}{tab === "settlements" && <div className="divide-y divide-slate-100">{settlements.length === 0 ? <Empty/> : settlements.map((item) => <Row key={item.id} title={"Order #" + (item.orderNumber || "Unavailable")} subtitle={"Store " + cash(item.storeAmount, item.currency) + " · Driver " + cash(item.driverAmount, item.currency) + " · " + displayDate(item.createdAt)} amount={cash(item.storeAmount + item.driverAmount, item.currency)} status={item.status}/>)}</div>}{tab === "refunds" && <div className="divide-y divide-slate-100">{refunds.length === 0 ? <Empty/> : refunds.map((item) => <Row key={item.id} title={label(item.scope) + " refund"} subtitle={"Order #" + (item.orderNumber || "Unavailable") + " · " + label(item.reason) + " · " + displayDate(item.updatedAt)} amount={cash(item.amount, item.currency)} status={item.status} note={item.lastError ? "Latest failure: " + item.lastError : ""}/>)}</div>}</section>
  </section>;
}
function Metric({icon, label: title, value, tone}: {icon: React.ReactNode; label: string; value: string; tone: string}) { return <article className={"rounded-2xl p-4 " + tone}><div className="flex items-center gap-2 text-sm font-bold">{icon}{title}</div><p className="mt-4 text-2xl font-bold">{value}</p></article>; }
function Row({title, subtitle, amount, status, note}: {title: string; subtitle: string; amount: string; status: string; note?: string}) { return <article className="flex flex-wrap items-center gap-3 px-5 py-4"><div className="min-w-0 flex-1"><p className="font-bold capitalize">{title}</p><p className="mt-1 text-sm text-slate-500">{subtitle}</p>{note && <p className="mt-1 text-xs text-red-600">{note}</p>}</div><div className="text-right"><p className="font-bold">{amount}</p><span className={"mt-1 inline-block rounded-full px-2.5 py-1 text-xs font-bold capitalize " + statusTone(status)}>{label(status)}</span></div></article>; }
function statusTone(status: string) { if (status === "completed") return "bg-green-100 text-green-800"; if (status === "failed" || status === "cancelled") return "bg-red-100 text-red-800"; if (status === "processing") return "bg-blue-100 text-blue-800"; return "bg-amber-100 text-amber-800"; }
function Empty() { return <p className="p-10 text-center text-sm text-slate-500">No financial records in this category yet.</p>; }

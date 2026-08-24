"use client";

/*
|--------------------------------------------------------------------------
| LIA Finance Report
|--------------------------------------------------------------------------
|
| Displays ledger-backed platform revenue. It intentionally distinguishes
| customer money collected from LIA revenue and participant payouts.
|
*/

import {useEffect, useState} from "react";
import {Banknote, ChevronDown, Landmark, LoaderCircle, ReceiptText, RotateCcw, Store} from "lucide-react";
import {adminWorkspaceClientService} from "@/services/admin/adminWorkspaceClientService";
import type {AdminLiaFinanceReport} from "@/types/adminWorkspace";

const cash = (amount: number) => new Intl.NumberFormat("en-US", {style: "currency", currency: "USD"}).format(amount / 100);

export function AdminLiaFinanceReport() {
  const [report, setReport] = useState<AdminLiaFinanceReport | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void adminWorkspaceClientService.getLiaFinanceReport().then(setReport).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to load the LIA finance report.")); }, []);
  if (error) return <p className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</p>;
  if (!report) return <div className="flex min-h-64 items-center justify-center"><LoaderCircle className="h-8 w-8 animate-spin text-orange-600"/></div>;
  const {revenue} = report;
  return <section><p className="text-sm font-bold tracking-wide text-orange-600">LIA FINANCE</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Platform revenue</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Revenue is based on immutable order-allocation and completed-refund ledger events, not the current commission configuration.</p>
    {report.window.limited && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This initial report covers the latest {report.window.allocationCount} settled allocation records. We will add durable daily/monthly reporting summaries before the volume grows beyond this operational window.</p>}
    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Card icon={<Landmark/>} title="Net LIA revenue" value={cash(revenue.netPlatformRevenue)} tone="bg-green-50 text-green-800"/><Card icon={<ReceiptText/>} title="Gross LIA revenue" value={cash(revenue.grossPlatformRevenue)} tone="bg-blue-50 text-blue-800"/><Card icon={<Banknote/>} title="Stripe processing fees" value={cash(revenue.stripeProcessingFees)} tone="bg-violet-50 text-violet-800"/><Card icon={<RotateCcw/>} title="LIA refund impact" value={cash(revenue.platformRefundImpact)} tone="bg-red-50 text-red-800"/><Card icon={<Banknote/>} title="Customer payments" value={cash(revenue.grossCustomerPayments)} tone="bg-orange-50 text-orange-800"/></div>
    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><h2 className="font-bold">How the money is represented</h2><div className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><Line label="Completed store and driver payouts" value={cash(revenue.participantTransfersCompleted)}/><Line label="Customer refund total" value={cash(revenue.refundAmount)}/><Line label="Sales tax collected for stores" value={cash(revenue.salesTaxCollected)}/><Line label="Driver tips collected" value={cash(revenue.driverTipsCollected)}/></div><p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">Sales tax and tips are included in customer payments but are not LIA revenue. Completed participant payouts are shown separately because they are money LIA sends to stores and drivers after delivery.</p></section>
    <StoreFinanceReports stores={report.stores ?? []} />
  </section>;
}

function StoreFinanceReports({stores}: {stores: AdminLiaFinanceReport["stores"]}) {
  const [openStoreId, setOpenStoreId] = useState<string | null>(null);
  return <section className="mt-8"><div className="flex items-center gap-3"><span className="rounded-xl bg-orange-50 p-2.5 text-orange-700"><Store className="h-5 w-5" /></span><div><h2 className="text-xl font-bold">Store finance reports</h2><p className="mt-1 text-sm text-slate-500">Select a store to review its ledger-backed sales, allocation, refunds, and LIA revenue.</p></div></div>
    <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">{stores.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No settled store activity is available in this reporting window.</p> : <div className="divide-y divide-slate-100">{stores.map((store) => {const open = openStoreId === store.storeId; return <article key={store.storeId}><button data-admin-read-action type="button" aria-expanded={open} onClick={() => setOpenStoreId(open ? null : store.storeId)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-orange-50/40"><div className="min-w-0 flex-1"><p className="font-bold text-slate-950">{store.storeName}</p><p className="mt-1 text-sm text-slate-500">{store.orderCount} settled {store.orderCount === 1 ? "order" : "orders"} · {cash(store.grossProductSales)} product sales</p></div><ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} /></button>{open && <div className="border-t border-slate-100 bg-slate-50/60 p-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Line label="Customer payments" value={cash(store.grossCustomerPayments)} /><Line label="Gross product sales" value={cash(store.grossProductSales)} /><Line label="Sales tax for store" value={cash(store.salesTaxCollected)} /><Line label="LIA store commission" value={cash(store.storeCommission)} /><Line label="Store amount allocated" value={cash(store.storeAllocation)} /><Line label="Store refund reversals" value={cash(store.storeRefundReversals)} /><Line label="Net store allocation" value={cash(store.netStoreAllocation)} /><Line label="Customer refunds" value={cash(store.customerRefunds)} /><Line label="Driver allocation" value={cash(store.driverAllocation)} /><Line label="Driver tips" value={cash(store.driverTips)} /><Line label="Gross LIA revenue" value={cash(store.liaRevenue)} /><Line label="LIA refund impact" value={cash(store.liaRefundImpact)} /><Line label="Stripe fees paid by LIA" value={cash(store.stripeProcessingFees)} /><Line label="Net LIA revenue" value={cash(store.netLiaRevenue)} /></div><p className="mt-4 text-xs leading-5 text-slate-500">Store allocation includes net merchandise proceeds plus sales tax. LIA commission is calculated from each order&apos;s immutable commission snapshot. Stripe processing fees are assigned to the store whose order generated the fee.</p></div>}</article>;})}</div>}</div>
  </section>;
}
function Card({icon, title, value, tone}: {icon: React.ReactNode; title: string; value: string; tone: string}) { return <article className={"rounded-2xl p-5 " + tone}><div className="flex items-center gap-2 text-sm font-bold">{icon}{title}</div><p className="mt-4 text-3xl font-bold">{value}</p></article>; }
function Line({label, value}: {label: string; value: string}) { return <div className="rounded-xl bg-slate-50 p-4"><p className="text-slate-500">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>; }

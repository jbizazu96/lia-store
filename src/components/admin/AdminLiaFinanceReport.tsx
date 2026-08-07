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
import {ArrowLeft, Banknote, Landmark, LoaderCircle, ReceiptText, RotateCcw} from "lucide-react";
import Link from "next/link";
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
  return <section><Link href="/admin/finance" className="mb-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-700 ring-1 ring-slate-200"><ArrowLeft className="h-4 w-4"/>Back to finance</Link><p className="text-sm font-bold tracking-wide text-orange-600">LIA FINANCE REPORT</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Platform revenue</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Revenue is based on immutable order-allocation and completed-refund ledger events, not the current commission configuration.</p>
    {report.window.limited && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This initial report covers the latest {report.window.allocationCount} settled allocation records. We will add durable daily/monthly reporting summaries before the volume grows beyond this operational window.</p>}
    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Card icon={<Landmark/>} title="Net LIA revenue" value={cash(revenue.netPlatformRevenue)} tone="bg-green-50 text-green-800"/><Card icon={<ReceiptText/>} title="Gross LIA revenue" value={cash(revenue.grossPlatformRevenue)} tone="bg-blue-50 text-blue-800"/><Card icon={<Banknote/>} title="Stripe processing fees" value={cash(revenue.stripeProcessingFees)} tone="bg-violet-50 text-violet-800"/><Card icon={<RotateCcw/>} title="LIA refund impact" value={cash(revenue.platformRefundImpact)} tone="bg-red-50 text-red-800"/><Card icon={<Banknote/>} title="Customer payments" value={cash(revenue.grossCustomerPayments)} tone="bg-orange-50 text-orange-800"/></div>
    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><h2 className="font-bold">How the money is represented</h2><div className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><Line label="Completed store and driver payouts" value={cash(revenue.participantTransfersCompleted)}/><Line label="Customer refund total" value={cash(revenue.refundAmount)}/><Line label="Sales tax collected for stores" value={cash(revenue.salesTaxCollected)}/><Line label="Driver tips collected" value={cash(revenue.driverTipsCollected)}/></div><p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">Sales tax and tips are included in customer payments but are not LIA revenue. Completed participant payouts are shown separately because they are money LIA sends to stores and drivers after delivery.</p></section>
  </section>;
}
function Card({icon, title, value, tone}: {icon: React.ReactNode; title: string; value: string; tone: string}) { return <article className={"rounded-2xl p-5 " + tone}><div className="flex items-center gap-2 text-sm font-bold">{icon}{title}</div><p className="mt-4 text-3xl font-bold">{value}</p></article>; }
function Line({label, value}: {label: string; value: string}) { return <div className="rounded-xl bg-slate-50 p-4"><p className="text-slate-500">{label}</p><p className="mt-1 text-lg font-bold">{value}</p></div>; }

"use client";

import { useEffect, useState } from "react";
import { PageContentSkeleton } from "@/components/ui/PageContentSkeleton";
import { driverWorkspaceClientService } from "@/services/driver/driverWorkspaceClientService";
import type { DriverPayment, DriverPaymentTotals } from "@/types/driverWorkspace";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value)) : "Pending";

export default function DriverPaymentsPage() {
  const [data, setData] = useState<{ payments: DriverPayment[]; totals: DriverPaymentTotals } | null>(null);
  useEffect(() => { void driverWorkspaceClientService.getPayments().then(setData).catch(() => setData(null)); }, []);
  if (!data) return <PageContentSkeleton cards={4} rows={5} />;
  const totals = [["Today", data.totals.today], ["Week", data.totals.week], ["Month", data.totals.month], ["Lifetime", data.totals.lifetime]];
  return <section className="mx-auto max-w-4xl"><p className="text-sm font-semibold text-orange-600">DRIVER PAYMENTS</p><h1 className="mt-1 text-3xl font-bold">Earnings</h1><div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">{totals.map(([label, total]) => <article key={String(label)} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-xl font-bold">{money(Number(total))}</p></article>)}</div><div className="mt-6 grid gap-4 sm:grid-cols-2"><article className="rounded-2xl border border-amber-100 bg-amber-50 p-5"><p className="text-sm font-medium text-amber-800">Pending payouts</p><p className="mt-2 text-2xl font-bold text-amber-900">{money(data.totals.pending)}</p></article><article className="rounded-2xl border border-green-100 bg-green-50 p-5"><p className="text-sm font-medium text-green-800">Paid payouts</p><p className="mt-2 text-2xl font-bold text-green-900">{money(data.totals.paid)}</p></article></div><h2 className="mt-8 text-xl font-bold">Payment history</h2>{data.payments.length === 0 ? <div className="mt-4 rounded-2xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-100">Completed delivery payouts will appear here.</div> : <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">{data.payments.map((payment) => <article key={payment.id} className="flex items-center justify-between border-b border-slate-100 p-4 last:border-0"><div><p className="font-semibold">Order {payment.orderNumber ?? "Unavailable"}</p><p className="mt-1 text-sm text-slate-500">{date(payment.paidAt ?? payment.createdAt)}</p></div><div className="text-right"><p className="font-bold">{money(payment.amount)}</p><p className={`mt-1 text-xs font-semibold capitalize ${payment.status === "paid" ? "text-green-600" : payment.status === "failed" ? "text-red-600" : "text-amber-600"}`}>{payment.status}</p></div></article>)}</div>}</section>;
}

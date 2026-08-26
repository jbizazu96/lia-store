"use client";

/*
|--------------------------------------------------------------------------
| Admin Platform Reports Workspace
|--------------------------------------------------------------------------
|
| This page visualizes aggregate callable data. It is intentionally not a
| browser Firestore listener, so platform reporting cannot expose private
| customer or payment records to an Admin client by accident.
|
*/

import {
  useEffect,
  useState,
} from "react";
import {
  Building2,
  CircleDollarSign,
  LoaderCircle,
  MapPinned,
  Route,
  ShoppingBag,
  Truck,
  UserPlus,
} from "lucide-react";
import {
  adminWorkspaceClientService,
} from "@/services/admin/adminWorkspaceClientService";
import type {
  AdminPlatformReport,
} from "@/types/adminWorkspace";

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

export function AdminPlatformReportsWorkspace() {
  const [periodDays, setPeriodDays] = useState(30);
  const [report, setReport] = useState<AdminPlatformReport | null>(null);
  const [error, setError] = useState("");
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState("");

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setReport(null);
      setError("");
    });
    void adminWorkspaceClientService.getPlatformReport(periodDays)
      .then((result) => { if (active) setReport(result); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load platform reporting.");
      });
    return () => { active = false; };
  }, [periodDays]);

  const backfill = async () => {
    setBackfilling(true);
    setBackfillMessage("");
    setError("");

    try {
      let orderCursor: string | undefined; let customerCursor: string | undefined; let ordersDone = false; let customersDone = false;
      let ordersScanned = 0; let customersScanned = 0;
      do {
        const result = await adminWorkspaceClientService.backfillPlatformReports({orderCursor, customerCursor, ordersDone, customersDone});
        ordersScanned += result.ordersScanned; customersScanned += result.customersScanned;
        orderCursor = result.nextOrderCursor ?? undefined;
        customerCursor = result.nextCustomerCursor ?? undefined;
        ordersDone = !result.nextOrderCursor;
        customersDone = !result.nextCustomerCursor;
        setBackfillMessage(`Synchronizing history… ${ordersScanned} orders and ${customersScanned} customers processed.`);
      } while (!ordersDone || !customersDone);
      setBackfillMessage(
        `Report history synchronized from ${ordersScanned} orders and ${customersScanned} customers.`
      );
      setReport(await adminWorkspaceClientService.getPlatformReport(periodDays));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to synchronize report history.");
    } finally {
      setBackfilling(false);
    }
  };

  return <section><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold tracking-wide text-orange-600">PLATFORM REPORTS</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Marketplace activity</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">A protected operational view of customer growth, confirmed order activity, marketplace sales, and active supply.</p></div><label className="text-sm font-bold text-slate-700">Reporting period<select value={periodDays} onChange={(event) => setPeriodDays(Number(event.target.value))} className="ml-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-semibold outline-none focus:ring-2 focus:ring-orange-300"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select></label></div>
    <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><div className="min-w-0 flex-1"><p className="font-bold">Initialize existing report history</p><p className="mt-1 text-sm text-slate-500">Use once after deployment to safely include existing orders and customers. Future activity updates automatically.</p></div><button type="button" disabled={backfilling} onClick={() => void backfill()} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-45">{backfilling ? "Synchronizing…" : "Synchronize history"}</button></div>
    {backfillMessage && <p className="mt-4 rounded-xl border border-green-100 bg-green-50 p-3 text-sm text-green-800">{backfillMessage}</p>}
    {error ? <p className="mt-6 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</p> : !report ? <Loading /> : <ReportContent report={report} />}
  </section>;
}

function ReportContent({report}: {report: AdminPlatformReport}) {
  const maxOrders = Math.max(1, ...report.daily.map((item) => item.orders));
  return <>
    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={<ShoppingBag />} label="Confirmed orders" value={String(report.metrics.confirmedOrders)} tone="bg-orange-50 text-orange-800" /><Metric icon={<Truck />} label="Delivery / pickup" value={`${report.metrics.deliveryOrders} / ${report.metrics.pickupOrders}`} tone="bg-sky-50 text-sky-800" /><Metric icon={<CircleDollarSign />} label="Gross customer payments" value={money(report.metrics.grossSalesAmount)} tone="bg-green-50 text-green-800" /><Metric icon={<UserPlus />} label="New customers" value={String(report.metrics.newCustomers)} tone="bg-blue-50 text-blue-800" /><Metric icon={<Building2 />} label="Active stores" value={String(report.metrics.activeStores)} tone="bg-violet-50 text-violet-800" /><Metric icon={<Truck />} label="Approved drivers" value={String(report.metrics.approvedDrivers)} tone="bg-sky-50 text-sky-800" /><Metric icon={<ShoppingBag />} label="Completed / cancelled" value={`${report.metrics.deliveredOrders} / ${report.metrics.cancelledOrders}`} tone="bg-slate-100 text-slate-800" /></div>
    <section className="mt-6">
      <div><h2 className="text-lg font-bold">Delivery zone reporting</h2><p className="mt-1 text-sm text-slate-500">Paid orders and account coverage for the selected reporting period.</p></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Route />} label="Average route miles" value={report.metrics.averageRouteMiles.toFixed(1)} tone="bg-blue-50 text-blue-800" />
        <Metric icon={<MapPinned />} label="Order Zone exceptions" value={String(report.metrics.orderZoneExceptions)} tone="bg-orange-50 text-orange-800" />
        <Metric icon={<Route />} label="Cross-zone deliveries" value={String(report.metrics.crossZoneDeliveries)} tone="bg-violet-50 text-violet-800" />
        <Metric icon={<CircleDollarSign />} label="Peak surcharge total" value={money(report.metrics.peakSurchargeAmount)} tone="bg-amber-50 text-amber-800" />
        <Metric icon={<UserPlus />} label="Customers without a zone" value={String(report.metrics.customersWithoutZone)} tone="bg-rose-50 text-rose-800" />
        <Metric icon={<Building2 />} label="Stores without a home zone" value={String(report.metrics.storesWithoutHomeZone)} tone="bg-slate-100 text-slate-800" />
      </div>
    </section>
    {report.zoneReportingLimited && <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Zone reporting is showing the first 5,000 paid-order candidates in this period. Reduce the reporting period for a complete operational view.</p>}
    <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
      <div className="border-b border-slate-100 p-5"><h2 className="font-bold">Orders and revenue by pricing zone</h2><p className="mt-1 text-sm text-slate-500">Revenue uses the immutable customer-payment total saved on each order.</p></div>
      {report.zones.length === 0 ? <p className="p-6 text-sm text-slate-500">No paid orders with zone snapshots were found in this period.</p> : <div className="overflow-x-auto"><table className="min-w-[850px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Pricing zone</th><th className="px-4 py-3">Orders</th><th className="px-4 py-3">Revenue</th><th className="px-4 py-3">Avg. miles</th><th className="px-4 py-3">Order Zone</th><th className="px-4 py-3">Cross-zone</th><th className="px-4 py-3">Peak fees</th></tr></thead><tbody className="divide-y divide-slate-100">{report.zones.map((zone) => <tr key={zone.pricingZoneId ?? "default"}><td className="px-5 py-4 font-bold">{zone.pricingZoneName}</td><td className="px-4 py-4">{zone.orders}</td><td className="px-4 py-4 font-semibold">{money(zone.revenueAmount)}</td><td className="px-4 py-4">{zone.averageRouteMiles.toFixed(1)}</td><td className="px-4 py-4">{zone.orderZoneExceptions}</td><td className="px-4 py-4">{zone.crossZoneDeliveries}</td><td className="px-4 py-4">{money(zone.peakSurchargeAmount)}</td></tr>)}</tbody></table></div>}
    </section>
    {report.limited && <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This operational report reached its current record window. We will add durable daily reporting summaries before the marketplace reaches this volume.</p>}
    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><div><h2 className="font-bold">Confirmed order activity</h2><p className="mt-1 text-sm text-slate-500">Daily orders in the selected period.</p></div><div className="mt-6 flex h-52 items-end gap-1.5 sm:gap-2">{report.daily.map((item) => <div key={item.date} className="group flex h-full min-w-0 flex-1 flex-col justify-end"><div title={`${item.date}: ${item.orders} orders`} style={{height: `${Math.max(item.orders ? 8 : 2, (item.orders / maxOrders) * 100)}%`}} className="rounded-t-md bg-orange-500 transition group-hover:bg-orange-600" /><p className="mt-2 truncate text-center text-[10px] text-slate-400">{item.date.slice(5)}</p></div>)}</div></section>
    <section className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100"><div className="border-b border-slate-100 p-5"><h2 className="font-bold">Daily marketplace detail</h2></div><div className="divide-y divide-slate-100">{[...report.daily].reverse().map((item) => <div key={item.date} className="grid grid-cols-3 gap-3 px-5 py-3 text-sm"><p className="font-semibold">{item.date}</p><p className="text-slate-600">{item.orders} orders · {item.customers} new customers</p><p className="text-right font-bold">{money(item.grossSalesAmount)}</p></div>)}</div></section>
  </>;
}

function Metric({icon, label, value, tone}: {icon: React.ReactNode; label: string; value: string; tone: string}) { return <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><div className={`inline-flex rounded-xl p-2.5 ${tone}`}>{icon}</div><p className="mt-4 text-2xl font-bold">{value}</p><p className="mt-1 text-sm font-medium text-slate-500">{label}</p></article>; }
function Loading() { return <div className="mt-6 flex justify-center rounded-2xl bg-white p-12"><LoaderCircle className="h-7 w-7 animate-spin text-orange-600" /></div>; }

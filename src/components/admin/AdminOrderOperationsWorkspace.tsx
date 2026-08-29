"use client";

/*
|--------------------------------------------------------------------------
| Admin Order Operations Workspace
|--------------------------------------------------------------------------
|
| This is deliberately read-only. Operational actions are introduced later
| through separately audited server-side commands.
|
*/

import {useEffect, useRef, useState} from "react";
import {ChevronRight, LoaderCircle, PackageCheck, Truck, UserRound} from "lucide-react";
import {useRouter} from "next/navigation";
import {adminWorkspaceClientService} from "@/services/admin/adminWorkspaceClientService";
import type {AdminOrderDetail, AdminOrderListItem} from "@/types/adminWorkspace";
import {AdminOrderSupportCard} from "@/components/admin/AdminOrderSupportCard";

const statuses = ["all", "pending", "accepted", "preparing", "ready_for_pickup", "driver_assigned", "picked_up", "out_for_delivery", "delivered", "completed", "cancelled"];
const exceptionOptions = [["all", "All orders"], ["no_driver", "No driver"], ["delayed_pickup", "Delayed pickup"], ["shipday_failed", "LIA Delivery failed"], ["cancelled", "Cancelled"]] as const;
const money = (amount: number, currency = "usd") => new Intl.NumberFormat("en-US", {style: "currency", currency: currency.toUpperCase()}).format(amount / 100);
const date = (value: string | null) => value ? new Date(value).toLocaleString("en-US", {month: "short", day: "numeric", hour: "numeric", minute: "2-digit"}) : "Not available";
const label = (value: string) => value === "shipday_failed" ? "LIA Delivery failed" : value.replace(/_/g, " ");

export function AdminOrderOperationsWorkspace({orderId}: {orderId?: string}) {
  const router = useRouter();
  const [status, setStatus] = useState("all");
  const [exception, setException] = useState("all");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<AdminOrderListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const listLoadedRef = useRef(false);
  const requestSequenceRef = useRef(0);

  useEffect(() => {
    const load = async (cursor?: string) => {
      const requestSequence = cursor ? requestSequenceRef.current : ++requestSequenceRef.current;
      setLoading(orderId ? true : !listLoadedRef.current); setError("");
      try {
        if (orderId) setDetail(await adminWorkspaceClientService.getOrder(orderId));
        else { const result = await adminWorkspaceClientService.getOrders({status, exception, ...(cursor ? {cursor} : {})}); if (!cursor && requestSequence !== requestSequenceRef.current) return; setOrders((current) => cursor ? [...current, ...result.orders] : result.orders); setNextCursor(result.nextCursor); listLoadedRef.current = true; }
      } catch (reason) { if (orderId || requestSequence === requestSequenceRef.current) setError(reason instanceof globalThis.Error ? reason.message : "Unable to load paid orders."); }
      finally { setLoading(false); }
    };
    void load();
  }, [orderId, status, exception]);

  if (orderId) return <section>
    <button data-admin-read-action type="button" onClick={() => router.push("/admin/orders")} className="mb-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-700 ring-1 ring-slate-200"><ChevronRight className="h-4 w-4 rotate-180" />Back to orders</button>
    {loading ? <Loading /> : error ? <ErrorPanel message={error} /> : detail ? <><ScheduledOrderBanner detail={detail} /><OrderDetail detail={detail} /><AdminOrderSupportCard orderId={detail.id} /></> : null}
  </section>;

  const visibleOrders = orders.filter((item) => {
    const query = search.trim().toLowerCase();
    return !query || [item.orderNumber, item.id, item.storeName, item.customerName, item.status, item.driverName ?? ""].some((value) => value.toLowerCase().includes(query));
  });
  return <section>
    <p className="text-sm font-bold tracking-wide text-orange-600">OPERATIONS</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Orders & delivery</h1>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Paid and confirmed orders only. Delivery exceptions are highlighted for review; this phase does not change fulfillment or payment records.</p>
    <div className="mt-6 grid gap-3 lg:grid-cols-3"><label className="text-sm font-bold text-slate-700">Search orders<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order number, store, customer…" className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-medium"/></label><label className="text-sm font-bold text-slate-700">Order status<select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-medium capitalize">{statuses.map((item) => <option key={item} value={item}>{item === "all" ? "All statuses" : label(item)}</option>)}</select></label><label className="text-sm font-bold text-slate-700">Delivery exception<select value={exception} onChange={(event) => setException(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-medium">{exceptionOptions.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label></div>
    {error && <ErrorPanel message={error} />}{loading ? <Loading /> : <><div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">{visibleOrders.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">No paid orders match these filters.</p> : <div className="divide-y divide-slate-100">{visibleOrders.map((item) => <button data-admin-read-action type="button" key={item.id} onClick={() => router.push("/admin/orders/" + item.id)} className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-orange-50/40"><div className="min-w-0 flex-1"><p className="font-bold text-slate-900">Order #{item.orderNumber}</p><p className="mt-1 text-sm text-slate-500">{item.storeName} · {item.customerName} · {date(item.createdAt)}</p><div className="mt-2 flex flex-wrap gap-2"><Badge value={item.status} /><Badge value={item.paymentStatus} /><Badge value={item.driverName ? item.driverName : "No assigned driver"} />{item.exceptions.map((value) => <Badge key={value} value={label(value)} warning />)}</div></div><div className="text-right"><p className="font-bold">{money(item.totalAmount, item.currency)}</p><ChevronRight className="ml-auto mt-2 h-5 w-5 text-slate-400" /></div></button>)}</div>}</div>{nextCursor && <button data-admin-read-action type="button" onClick={() => void (async () => { setLoading(true); try { const result = await adminWorkspaceClientService.getOrders({status, exception, cursor: nextCursor}); setOrders((current) => [...current, ...result.orders]); setNextCursor(result.nextCursor); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load more orders."); } finally { setLoading(false); } })()} className="mt-4 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold">Load more orders</button>}</>}
  </section>;
}

function ScheduledOrderBanner({detail}: {detail: AdminOrderDetail}) {
  if (detail.fulfillmentTiming !== "scheduled" || !detail.scheduledWindowStart) return null;
  return <div className="mb-5 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950"><b>Scheduled {detail.fulfillmentType}:</b> {date(detail.scheduledWindowStart)}{detail.fulfillmentTimezone ? ` (${detail.fulfillmentTimezone.replace(/_/g, " ")})` : ""}</div>;
}

function OrderDetail({detail}: {detail: AdminOrderDetail}) { const pickup=detail.fulfillmentType==="pickup"; return <><p className="text-sm font-bold tracking-wide text-orange-600">PAID {pickup?"PICKUP":"DELIVERY"} ORDER</p><div className="mt-1 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl font-bold">Order #{detail.orderNumber}</h1><p className="mt-2 text-sm text-slate-500">{date(detail.createdAt)} · {label(detail.status)}</p></div><p className="text-2xl font-bold">{money(detail.pricing.totalAmount, detail.pricing.currency)}</p></div><div className="mt-6 grid gap-4 lg:grid-cols-3"><Card icon={<UserRound />} title="Customer" values={[detail.customer.name, detail.customer.email || "", detail.customer.phone || "", pickup?"Customer pickup":detail.customer.address || ""]}/><Card icon={<PackageCheck />} title="Store" values={[detail.store.name, detail.store.phone || "", detail.store.address || ""]}/><Card icon={<Truck />} title={pickup?"Pickup":"Delivery"} values={pickup?["Customer collects this order","LIA Delivery not required"]:[detail.delivery.driverName || "No LIA Driver assigned", detail.delivery.shipdayStatus ? "LIA Delivery: " + label(detail.delivery.shipdayStatus) : "LIA Delivery not started", detail.delivery.distanceMiles ? detail.delivery.distanceMiles + " miles" : "", detail.delivery.estimatedMinutes ? "Estimated " + detail.delivery.estimatedMinutes + " min" : ""]}/></div>{detail.exceptions.length > 0 && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><b>Needs review:</b> {detail.exceptions.map(label).join(" · ")}{detail.delivery.cancellationReason ? " — " + detail.delivery.cancellationReason : ""}</div>}<section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><h2 className="font-bold">Order items</h2><div className="mt-3 divide-y divide-slate-100">{detail.items.map((item, index) => <div key={index} className="flex justify-between py-3 text-sm"><span>{item.quantity} × {item.name}</span><b>{money(item.lineTotalAmount, detail.pricing.currency)}</b></div>)}</div><div className="mt-4 grid gap-2 border-t pt-4 text-sm sm:grid-cols-2"><p>Subtotal <b className="float-right">{money(detail.pricing.subtotalAmount, detail.pricing.currency)}</b></p><p>{pickup?"Pickup fee":"Delivery"} <b className="float-right">{money(detail.pricing.deliveryFeeAmount, detail.pricing.currency)}</b></p><p>Service fee <b className="float-right">{money(detail.pricing.serviceFeeAmount, detail.pricing.currency)}</b></p><p>Tax <b className="float-right">{money(detail.pricing.taxAmount, detail.pricing.currency)}</b></p>{!pickup&&<p>Tip <b className="float-right">{money(detail.pricing.tipAmount, detail.pricing.currency)}</b></p>}<p className="font-bold">Total <b className="float-right">{money(detail.pricing.totalAmount, detail.pricing.currency)}</b></p></div></section><section className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><h2 className="font-bold">Payment & fulfillment timeline</h2><div className="mt-4 space-y-4">{detail.history.length === 0 ? <p className="text-sm text-slate-500">No status events recorded.</p> : detail.history.map((item, index) => <div key={index} className="border-l-2 border-orange-200 pl-4"><p className="font-bold capitalize">{label(item.status)}</p><p className="text-xs text-slate-500">{date(item.timestamp)}</p>{item.note && <p className="mt-1 text-sm text-slate-600">{item.note}</p>}</div>)}</div></section></>; }
function Card({title, values, icon}: {title: string; values: string[]; icon: React.ReactNode}) { return <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><div className="flex items-center gap-2 font-bold">{icon}{title}</div><div className="mt-3 space-y-1 text-sm text-slate-600">{values.filter(Boolean).map((value) => <p key={value}>{value}</p>)}</div></article>; }
function Badge({value, warning}: {value: string; warning?: boolean}) {
  const normalized = value.toLowerCase().replace(/\s+/g, "_");
  const tone = warning
    ? "bg-amber-100 text-amber-800"
    : ["completed", "delivered", "paid", "confirmed"].includes(normalized)
      ? "bg-green-100 text-green-800"
      : ["cancelled", "failed", "payment_failed", "refunded"].includes(normalized)
        ? "bg-red-100 text-red-800"
        : ["accepted", "preparing", "ready_for_pickup", "driver_assigned", "picked_up", "out_for_delivery"].includes(normalized)
          ? "bg-blue-100 text-blue-800"
          : ["pending", "awaiting_payment"].includes(normalized)
            ? "bg-amber-100 text-amber-800"
            : "bg-slate-100 text-slate-600";

  return <span className={"rounded-full px-2.5 py-1 text-xs font-bold capitalize " + tone}>{value}</span>;
}
function Loading() { return <div className="mt-8 flex justify-center rounded-2xl bg-white p-12"><LoaderCircle className="h-7 w-7 animate-spin text-orange-600"/></div>; }
function ErrorPanel({message}: {message: string}) { return <p className="mt-6 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{message}</p>; }

"use client";

/*
|--------------------------------------------------------------------------
| Admin Customer Management Workspace
|--------------------------------------------------------------------------
|
| The customer directory and account detail are populated exclusively by
| administrator-authorized callable Functions. It deliberately exposes no
| payment secrets, customer documents, or Firestore write access.
|
*/

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import Image from "next/image";
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  LoaderCircle,
  MapPin,
  ShieldAlert,
  ShoppingBag,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import {useSearchParams} from "next/navigation";
import {
  adminWorkspaceClientService,
} from "@/services/admin/adminWorkspaceClientService";
import type {
  AdminCustomerDetail,
  AdminCustomerListItem,
} from "@/types/adminWorkspace";
import {AdminZoneAssignmentEditor} from "@/components/admin/AdminZoneAssignmentEditor";
import type {DeliveryZone} from "@/types/deliveryZone";

type AccountFilter = "all" | "active" | "suspended";

function displayDate(value: string | null): string {
  return value
    ? new Date(value).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    : "Not available";
}

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function label(value: string): string {
  return value.replace(/_/g, " ");
}

function statusClass(status: string): string {
  return status === "active" || status === "paid" || status === "delivered"
    ? "bg-green-100 text-green-800"
    : status === "suspended" || status === "failed" || status === "cancelled"
      ? "bg-red-100 text-red-800"
      : "bg-amber-100 text-amber-800";
}

export function AdminCustomerManagementWorkspace() {
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<AdminCustomerListItem[]>([]);
  const [counts, setCounts] = useState({total: 0, active: 0, suspended: 0});
  const [filter, setFilter] = useState<AccountFilter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AdminCustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [limited, setLimited] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [suspensionMode, setSuspensionMode] = useState(false);
  const [reason, setReason] = useState("");
  const [zones, setZones] = useState<DeliveryZone[]>([]);

  const load = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError("");

    try {
      const result = await adminWorkspaceClientService.getCustomers({
        search,
        status: filter,
        ...(cursor ? {cursor} : {}),
      });
      setCustomers((current) => cursor ? [...current, ...result.customers] : result.customers);
      setCounts(result.counts);
      setLimited(result.limited);
      setNextCursor(result.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load customers.");
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    void adminWorkspaceClientService.getDeliveryZones().then((result) => setZones(result.zones)).catch(() => undefined);
  }, []);

  const openCustomer = async (customerId: string) => {
    setDetailLoading(true);
    setError("");
    setSuspensionMode(false);
    setReason("");

    try {
      setSelected(await adminWorkspaceClientService.getCustomer(customerId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load this customer.");
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    const customerId = searchParams.get("customerId");
    if (customerId) queueMicrotask(() => void openCustomer(customerId));
  }, [searchParams]);

  const closeCustomer = () => {
    setSelected(null);
    setSuspensionMode(false);
    setReason("");
  };

  const updateSuspension = async (isSuspended: boolean) => {
    if (!selected || (isSuspended && !reason.trim())) return;
    setWorking(true);
    setError("");

    try {
      await adminWorkspaceClientService.setCustomerSuspension(
        selected.id,
        isSuspended,
        isSuspended ? reason.trim() : undefined,
      );
      await Promise.all([load(), openCustomer(selected.id)]);
      setSuspensionMode(false);
      setReason("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update the account.");
    } finally {
      setWorking(false);
    }
  };

  const decideOrderZoneRequest = async (input: {requestId: string; decision: "approved" | "rejected"; message: string; zoneId?: string}) => {
    if (!selected) return;
    setWorking(true); setError("");
    try {await adminWorkspaceClientService.decideOrderZoneRequest(input); await openCustomer(selected.id);}
    catch (cause) {setError(cause instanceof Error ? cause.message : "Unable to review the Order Zone request.");}
    finally {setWorking(false);}
  };

  return <section>
    <p className="text-sm font-bold tracking-wide text-orange-600">CUSTOMER MANAGEMENT</p>
    <h1 className="mt-1 text-3xl font-bold tracking-tight">Customers</h1>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Review safe customer account context, confirmed order activity, notifications, and deletion requests. Suspension prevents protected customer actions until the account is reinstated.</p>

    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      <Metric label="All customers" value={counts.total} tone="bg-white" />
      <Metric label="Active" value={counts.active} tone="bg-green-50 text-green-900" />
      <Metric label="Suspended" value={counts.suspended} tone="bg-red-50 text-red-900" />
    </div>

    <div className="mt-6 grid gap-3 md:grid-cols-[1fr_220px]">
      <label className="text-sm font-bold text-slate-700">Search customers
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, phone, or customer ID" className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-medium outline-none focus:ring-2 focus:ring-orange-300" />
      </label>
      <label className="text-sm font-bold text-slate-700">Account status
        <select value={filter} onChange={(event) => setFilter(event.target.value as AccountFilter)} className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-medium outline-none focus:ring-2 focus:ring-orange-300">
          <option value="all">All accounts</option><option value="active">Active</option><option value="suspended">Suspended</option>
        </select>
      </label>
    </div>

    {limited && <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">More matching customers are available. Load the next page to continue.</p>}
    {error && <p className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {loading ? <Loading /> : <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
      {customers.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">No customers match these filters.</p> : <div className="divide-y divide-slate-100">
        {customers.map((customer) => <button data-admin-read-action type="button" key={customer.id} onClick={() => void openCustomer(customer.id)} className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-orange-50/50">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-100 font-bold text-orange-700">{customer.profileImageUrl ? <Image src={customer.profileImageUrl} alt="" fill sizes="40px" className="object-cover" /> : customer.name.slice(0, 1).toUpperCase()}</div>
          <div className="min-w-0 flex-1"><p className="truncate font-bold">{customer.name}</p><p className="mt-1 truncate text-sm text-slate-500">{customer.email || customer.phone || customer.id}</p><p className="mt-1 text-xs text-slate-400">Joined {displayDate(customer.createdAt)}</p></div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusClass(customer.accountStatus)}`}>{customer.accountStatus}</span><ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
        </button>)}
      </div>}
    </div>}
    {!loading && nextCursor && <button data-admin-read-action type="button" onClick={() => void load(nextCursor)} className="mt-4 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Load more customers</button>}

    {(detailLoading || selected) && <div className="fixed inset-0 z-50 flex items-end bg-slate-950/35 p-0 sm:items-center sm:justify-center sm:p-6">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7">
        {detailLoading ? <Loading /> : selected && <CustomerDetail detail={selected} zones={zones} working={working} suspensionMode={suspensionMode} reason={reason} onClose={closeCustomer} onSuspensionMode={() => setSuspensionMode(true)} onReason={setReason} onCancel={() => { setSuspensionMode(false); setReason(""); }} onSuspend={() => void updateSuspension(true)} onReinstate={() => void updateSuspension(false)} onZoneSaved={() => openCustomer(selected.id)} onOrderZoneDecision={decideOrderZoneRequest} />}
      </div>
    </div>}
  </section>;
}

function CustomerDetail({detail, zones, working, suspensionMode, reason, onClose, onSuspensionMode, onReason, onCancel, onSuspend, onReinstate, onZoneSaved, onOrderZoneDecision}: {detail: AdminCustomerDetail; zones: DeliveryZone[]; working: boolean; suspensionMode: boolean; reason: string; onClose: () => void; onSuspensionMode: () => void; onReason: (value: string) => void; onCancel: () => void; onSuspend: () => void; onReinstate: () => void; onZoneSaved: () => Promise<void>; onOrderZoneDecision: (input: {requestId: string; decision: "approved" | "rejected"; message: string; zoneId?: string}) => Promise<void>}) {
  const suspended = detail.profile.accountStatus === "suspended";
  return <><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-100 font-bold text-orange-700">{detail.profile.profileImageUrl ? <Image src={detail.profile.profileImageUrl} alt="" fill sizes="48px" className="object-cover" /> : detail.profile.name.slice(0, 1).toUpperCase()}</div><div><p className="text-sm font-bold tracking-wide text-orange-600">CUSTOMER ACCOUNT</p><h2 className="truncate text-2xl font-bold">{detail.profile.name}</h2></div></div><button data-admin-read-action type="button" onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Close customer detail"><X className="h-5 w-5" /></button></div>
    <div className="mt-5 flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-sm font-bold capitalize ${statusClass(detail.profile.accountStatus)}`}>{detail.profile.accountStatus}</span><span className="text-sm text-slate-500">Joined {displayDate(detail.profile.createdAt)}</span></div>
    {suspended && <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-800"><b>Suspension reason:</b> {detail.profile.suspensionReason || "No reason recorded."}</div>}
    <div className="mt-6 grid gap-4 md:grid-cols-2"><Info icon={<UserRound className="h-5 w-5" />} title="Profile" values={[detail.profile.email, detail.profile.phone]} /><Info icon={<MapPin className="h-5 w-5" />} title="Default delivery address" values={[detail.address || "No saved address"]} /></div>
    {detail.orderZoneRequests.length > 0 && <section className="mt-6 rounded-2xl border border-orange-200 bg-orange-50/50 p-5"><div className="flex items-center gap-2"><MapPin className="h-5 w-5 text-orange-600" /><h3 className="font-bold">Order Zone requests</h3></div><div className="mt-3 space-y-3">{detail.orderZoneRequests.map((request) => <OrderZoneReview key={request.id} request={request} zones={zones} working={working} onDecision={onOrderZoneDecision} />)}</div></section>}
    <AdminZoneAssignmentEditor accountType="customer" accountId={detail.id} homeZoneId={detail.zoneAssignment.homeZoneId} orderZoneIds={detail.zoneAssignment.orderZoneIds} disabled={working} onSaved={onZoneSaved}/>
    <section className="mt-6 rounded-2xl border border-slate-100 p-5"><div className="flex items-center gap-2"><ShoppingBag className="h-5 w-5 text-orange-600" /><h3 className="font-bold">Recent orders</h3></div>{detail.orders.length === 0 ? <p className="mt-3 text-sm text-slate-500">No orders have been created for this account.</p> : <div className="mt-3 divide-y divide-slate-100">{detail.orders.map((order) => <div key={order.id} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-bold">Order #{order.orderNumber}</p><p className="mt-1 text-slate-500">{order.storeName} · {displayDate(order.createdAt)}</p></div><div className="text-right"><p className="font-bold">{money(order.totalAmount, order.currency)}</p><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${statusClass(order.status)}`}>{label(order.status)}</span></div></div>)}</div>}</section>
    <section className="mt-6 rounded-2xl border border-slate-100 p-5"><div className="flex items-center gap-2"><Bell className="h-5 w-5 text-orange-600" /><h3 className="font-bold">Recent account notifications</h3></div>{detail.notifications.length === 0 ? <p className="mt-3 text-sm text-slate-500">No recent notifications.</p> : <div className="mt-3 space-y-3">{detail.notifications.map((notification) => <div key={notification.id} className={`rounded-xl p-3 text-sm ${notification.read ? "bg-slate-50" : "bg-orange-50"}`}><p className="font-bold">{notification.title}</p>{notification.body && <p className="mt-1 text-slate-600">{notification.body}</p>}<p className="mt-1 text-xs text-slate-400">{displayDate(notification.createdAt)}</p></div>)}</div>}</section>
    {detail.deletionRequest && <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><b>Account deletion request:</b> {label(detail.deletionRequest.status)} · requested {displayDate(detail.deletionRequest.requestedAt)}. Review it from Deletion requests.</div>}
    {suspensionMode && <div className="mt-6 rounded-xl border border-red-100 bg-red-50 p-4"><label className="text-sm font-bold text-red-900">Suspension reason<textarea value={reason} onChange={(event) => onReason(event.target.value)} rows={3} maxLength={1000} className="mt-2 block w-full rounded-lg border border-red-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-red-300" placeholder="Explain why this customer account is being suspended." /></label><div className="mt-3 flex gap-2"><button type="button" disabled={working || !reason.trim()} onClick={onSuspend} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-45">Suspend account</button><button type="button" disabled={working} onClick={onCancel} className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-600 ring-1 ring-slate-200">Cancel</button></div></div>}
    <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-100 pt-5">{suspended ? <button type="button" disabled={working} onClick={onReinstate} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-45"><ShieldAlert className="h-4 w-4" />Reinstate account</button> : !suspensionMode && <button type="button" disabled={working} onClick={onSuspensionMode} className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 ring-1 ring-red-100"><ShieldAlert className="h-4 w-4" />Suspend account</button>}</div>
  </>;
}

function OrderZoneReview({request, zones, working, onDecision}: {request: AdminCustomerDetail["orderZoneRequests"][number]; zones: DeliveryZone[]; working: boolean; onDecision: (input: {requestId: string; decision: "approved" | "rejected"; message: string; zoneId?: string}) => Promise<void>}) {
  const [message, setMessage] = useState("");
  const [zoneId, setZoneId] = useState(request.storeHomeZoneId ?? "");
  const pending = request.status === "pending_review";
  return <article id={`order-zone-request-${request.id}`} className="rounded-xl bg-white p-4 text-sm ring-1 ring-orange-100"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold">{request.storeName || request.requestedStoreCity}</p><span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusClass(request.status)}`}>{label(request.status)}</span></div><p className="mt-2 text-slate-600"><b>Store city:</b> {request.requestedStoreCity}</p><p className="mt-1 text-slate-600"><b>Requested delivery address:</b> {request.customerAddress}</p><p className="mt-2 text-xs text-slate-400">Submitted {displayDate(request.createdAt)}</p>
    {request.decisionMessage && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-slate-700"><b>Message sent:</b> {request.decisionMessage}</p>}
    {pending && <div className="mt-4 border-t border-orange-100 pt-4"><label className="block font-bold text-slate-700">Order Zone to approve<select value={zoneId} onChange={(event) => setZoneId(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"><option value="">Choose a delivery zone</option>{zones.filter((zone) => zone.isActive).map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label><label className="mt-3 block font-bold text-slate-700">Message to customer<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} maxLength={1000} placeholder="Explain the approval or why the request was declined." className="mt-2 block w-full rounded-xl border border-slate-200 p-3 font-normal" /></label><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={working || !zoneId || !message.trim()} onClick={() => void onDecision({requestId: request.id, decision: "approved", message: message.trim(), zoneId})} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 font-bold text-white disabled:opacity-45"><CheckCircle2 className="h-4 w-4" />Approve and notify</button><button type="button" disabled={working || !message.trim()} onClick={() => void onDecision({requestId: request.id, decision: "rejected", message: message.trim()})} className="inline-flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 font-bold text-red-700 ring-1 ring-red-100 disabled:opacity-45"><XCircle className="h-4 w-4" />Decline and notify</button></div></div>}
  </article>;
}

function Metric({label, value, tone}: {label: string; value: number; tone: string}) { return <article className={`rounded-2xl p-5 shadow-sm ring-1 ring-slate-100 ${tone}`}><p className="text-sm font-semibold text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></article>; }
function Info({icon, title, values}: {icon: React.ReactNode; title: string; values: string[]}) { return <article className="rounded-2xl border border-slate-100 p-5"><div className="flex items-center gap-2 font-bold">{icon}{title}</div><div className="mt-3 space-y-1 text-sm text-slate-600">{values.filter(Boolean).map((value) => <p key={value}>{value}</p>)}</div></article>; }
function Loading() { return <div className="mt-6 flex justify-center rounded-2xl bg-white p-12"><LoaderCircle className="h-7 w-7 animate-spin text-orange-600" /></div>; }

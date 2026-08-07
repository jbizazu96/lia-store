"use client";

/* Protected admin response panel embedded in one order's operations view. */

import {useEffect, useState} from "react";
import {Headphones, LoaderCircle} from "lucide-react";
import {orderSupportClientService, type AdminOrderSupportRequest} from "@/services/order/orderSupportClientService";

function label(value: string): string { return value.replaceAll("_", " "); }
function date(value: string | null): string | null { if (!value) return null; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? null : new Intl.DateTimeFormat("en-US", {month: "short", day: "numeric", hour: "numeric", minute: "2-digit"}).format(parsed); }

export function AdminOrderSupportCard({orderId}: {orderId: string}) {
  const [request, setRequest] = useState<AdminOrderSupportRequest | null>(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"in_review" | "responded" | "resolved">("responded");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = async () => { const result = await orderSupportClientService.getAdmin(orderId); setRequest(result.request); };
  useEffect(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load order support.")).finally(() => setLoading(false)); }, [orderId]);
  const submit = async () => { if (!request || !message.trim()) { setError("Write a response before sending it."); return; } setSaving(true); setError(""); try { await orderSupportClientService.respondAdmin({requestId: request.id, message: message.trim(), status}); setMessage(""); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to send the response."); } finally { setSaving(false); } };
  if (loading || !request) return null;
  return <section className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-5 shadow-sm"><div className="flex items-start gap-3"><div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-blue-100"><Headphones className="h-5 w-5 text-blue-700"/></div><div><p className="text-xs font-bold tracking-wide text-blue-700">ORDER SUPPORT</p><h2 className="mt-1 font-bold text-blue-950">{request.customerName} needs help: <span className="capitalize">{label(request.reason)}</span></h2></div><span className="ml-auto rounded-full bg-white px-2.5 py-1 text-xs font-bold capitalize text-blue-800">{label(request.status)}</span></div><div className="mt-4 rounded-xl bg-white/80 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Customer note</p><p className="mt-1 text-sm leading-6 text-slate-800">{request.message}</p>{date(request.createdAt) && <p className="mt-2 text-xs text-slate-500">{date(request.createdAt)}</p>}</div><p className="mt-3 rounded-xl border border-blue-100 bg-white/70 p-3 text-sm leading-6 text-blue-950">LIA Admin is the customer&apos;s only point of contact. Use this order&apos;s store details to follow up with the store privately, then reply to the customer here.</p>{request.adminResponse && <div className="mt-3 rounded-xl border border-orange-100 bg-orange-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-orange-800">Latest LIA Support response</p><p className="mt-1 text-sm leading-6 text-orange-900">{request.adminResponse.message}</p></div>}{error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px]"><label className="text-sm font-bold text-slate-800">Reply to customer<textarea value={message} maxLength={2000} rows={3} onChange={(event) => setMessage(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium" placeholder="Explain the next step or resolution."/></label><label className="text-sm font-bold text-slate-800">Request status<select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium"><option value="in_review">In review</option><option value="responded">Responded</option><option value="resolved">Resolved</option></select><button type="button" disabled={saving} onClick={() => void submit()} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60">{saving && <LoaderCircle className="h-4 w-4 animate-spin"/>}Send reply</button></label></div></section>;
}

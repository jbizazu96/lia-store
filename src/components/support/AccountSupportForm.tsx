"use client";

import {useState} from "react";
import {LoaderCircle, Send} from "lucide-react";
import {accountSupportClientService, type AccountSupportReason} from "@/services/support/accountSupportClientService";

const options: Array<{value: AccountSupportReason; label: string}> = [{value: "account", label: "Account"}, {value: "orders", label: "Orders"}, {value: "payments", label: "Payments or payouts"}, {value: "delivery", label: "Delivery"}, {value: "technical", label: "Technical problem"}, {value: "other", label: "Other"}];

export function AccountSupportForm({accountLabel}: {accountLabel: "store" | "driver"}) {
  const [reason, setReason] = useState<AccountSupportReason>("account"); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState<{tone: "success" | "error"; text: string} | null>(null);
  const submit = async () => {
    if (message.trim().length < 10) { setNotice({tone: "error", text: "Please describe the issue using at least 10 characters."}); return; }
    try { setBusy(true); setNotice(null); await accountSupportClientService.create({reason, message: message.trim()}); setMessage(""); setReason("account"); setNotice({tone: "success", text: "Your request was sent to LIA Support. An administrator will review it."}); } catch (error) { setNotice({tone: "error", text: error instanceof Error ? error.message : "Unable to send the support request."}); } finally { setBusy(false); }
  };
  return <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"><h2 className="font-bold text-gray-900">Contact LIA Support</h2><p className="mt-1 text-sm leading-6 text-gray-500">Send a protected request connected to your {accountLabel} account.</p>{notice && <p className={`mt-4 rounded-xl p-3 text-sm ${notice.tone === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{notice.text}</p>}<div className="mt-5 grid gap-4"><label className="text-sm font-semibold text-gray-700">Reason<select value={reason} onChange={(event) => setReason(event.target.value as AccountSupportReason)} className="mt-2 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 font-normal">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="text-sm font-semibold text-gray-700">Message<textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} rows={6} placeholder="Explain what happened and what help you need." className="mt-2 block w-full rounded-xl border border-gray-200 p-3 font-normal"/><span className="mt-1 block text-right text-xs text-gray-400">{message.length}/2000</span></label><button type="button" disabled={busy || message.trim().length < 10} onClick={() => void submit()} className="inline-flex w-fit items-center gap-2 rounded-full bg-orange-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4"/>}Send request</button></div></section>;
}

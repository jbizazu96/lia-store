"use client";

import {useEffect, useState} from "react";
import {createPortal} from "react-dom";
import {CheckCircle2, LoaderCircle, Send, X} from "lucide-react";
import {httpsCallable} from "firebase/functions";
import {functions} from "@/lib/firebase";

export function PublicSupportButton({children, className}: {children: React.ReactNode; className?: string}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [reason, setReason] = useState("other"); const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [busy, open]);

  const close = () => { if (!busy) setOpen(false); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await httpsCallable(functions, "createPublicSupportRequest")({name, email, reason, message, website});
      setSent(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your question could not be sent. Please try again."); }
    finally { setBusy(false); }
  };

  const dialog = open ? <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px] sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section role="dialog" aria-modal="true" aria-labelledby="public-support-title" className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 text-left text-slate-900 shadow-2xl sm:p-6"><header className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-600">LIA Support</p><h2 id="public-support-title" className="mt-1 text-2xl font-black">How can we help?</h2><p className="mt-2 text-sm leading-6 text-slate-600">Send a general question without opening the customer application. Do not include passwords or payment-card information.</p></div><button type="button" onClick={close} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100" aria-label="Close support form"><X className="h-5 w-5"/></button></header>{sent ? <div className="py-10 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600"/><h3 className="mt-4 text-xl font-black">Question sent</h3><p className="mt-2 text-sm text-slate-600">LIA Support received your message and will use the email address you provided to respond.</p><button type="button" onClick={close} className="mt-6 w-full rounded-full bg-orange-600 px-5 py-3 font-bold text-white">Done</button></div> : <form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-sm font-bold">Name<input required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal" autoComplete="name"/></label><label className="block text-sm font-bold">Email address<input required type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal" autoComplete="email"/></label><label className="block text-sm font-bold">Question about<select value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-normal"><option value="account">Account</option><option value="orders">Orders</option><option value="payments">Payments</option><option value="delivery">Delivery</option><option value="technical">Technical issue</option><option value="other">General question</option></select></label><label className="block text-sm font-bold">Question<textarea required minLength={10} maxLength={2000} rows={6} value={message} onChange={(event) => setMessage(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal" placeholder="Tell us what you need help with."/></label><label className="hidden" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)}/></label>{error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}<button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-full bg-orange-600 px-5 py-3 font-bold text-white disabled:opacity-50">{busy ? <LoaderCircle className="h-5 w-5 animate-spin"/> : <Send className="h-5 w-5"/>}{busy ? "Sending…" : "Send question"}</button></form>}</section></div> : null;

  return <><button type="button" onClick={() => { setSent(false); setError(""); setOpen(true); }} className={className}>{children}</button>{dialog ? createPortal(dialog, document.body) : null}</>;
}

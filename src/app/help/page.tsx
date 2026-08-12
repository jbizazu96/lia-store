"use client";

/*
|--------------------------------------------------------------------------
| Help Center
|--------------------------------------------------------------------------
|
| A small public starting point for marketplace support. It contains no
| account data and therefore does not access Firebase from the browser.
|
*/

import {
  ChevronRight,
  CircleHelp,
  FileWarning,
  Mail,
  PackageSearch,
  ShieldCheck,
  MapPinned,
  X,
} from "lucide-react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useEffect, useState} from "react";
import {createPortal} from "react-dom";
import {
  CustomerBottomNavigation,
} from "@/components/customer/navigation/CustomerBottomNavigation";
import {orderZoneRequestClientService} from "@/services/customer/orderZoneRequestClientService";

export default function HelpPage() {
  const router = useRouter();
  const [showOrderZoneForm, setShowOrderZoneForm] = useState(false);
  const [customerAddress, setCustomerAddress] = useState("");
  const [storeCity, setStoreCity] = useState("");
  const [storeId, setStoreId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formMessage, setFormMessage] = useState("");

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("request") === "order-zone") {
      queueMicrotask(() => {
        setShowOrderZoneForm(true);
        setStoreCity(query.get("storeCity") ?? "");
        setStoreId(query.get("storeId") ?? "");
      });
    }
  }, []);

  useEffect(() => {
    if (!showOrderZoneForm) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowOrderZoneForm(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [showOrderZoneForm]);

  const submitOrderZoneRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setFormMessage("");
    try {
      await orderZoneRequestClientService.create({customerAddress, storeCity, ...(storeId ? {storeId} : {})});
      setShowOrderZoneForm(false);
      setCustomerAddress("");
      setStoreCity("");
      setStoreId("");
      setFormMessage("Your Order Zone request was sent. LIA Support will notify you after review. Returning you home…");
      window.setTimeout(() => router.replace("/home"), 1800);
    } catch (reason) {
      setFormMessage(reason instanceof Error ? reason.message : "Unable to send your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-white pb-28">
      <header className="sticky top-0 z-20 bg-white/95 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl justify-center">
          <h1 className="text-xl font-extrabold tracking-tight text-gray-900">Help Center</h1>
        </div>
      </header>

      <div className="mx-auto max-w-xl space-y-6 px-4 py-5">
        {formMessage && !showOrderZoneForm && <p className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold leading-6 text-green-800" role="status">{formMessage}</p>}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-50 via-amber-50 to-white p-6 shadow-[0_12px_35px_rgba(249,115,22,0.08)]">
          <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-orange-200/35" />
          <div className="pointer-events-none absolute -bottom-12 right-16 h-24 w-24 rounded-full bg-amber-100/70" />
          <div className="relative">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/80 bg-white/65 text-orange-600 shadow-sm">
              <CircleHelp className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-gray-900">How can we help?</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-gray-600">Get help with an order, report a problem, or reach the LIA support team. We keep the process clear from start to resolution.</p>
          </div>
        </section>

        <section className="rounded-2xl border border-orange-200 bg-white p-5 shadow-[0_4px_12px_rgba(15,23,42,0.06)]">
          <div className="flex gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
              <PackageSearch className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-extrabold text-gray-900">Need help with an order?</h2>
              <p className="mt-1 text-sm leading-6 text-gray-600">For late delivery, missing items, damaged products, or a refund request, open the exact order first. Your request goes to LIA Admin for review.</p>
              <Link href="/orders" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600">
                View my orders <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-3 px-1">
            <h2 className="text-base font-extrabold text-gray-900">More ways we can help</h2>
            <p className="mt-0.5 text-xs text-gray-500">Choose the option that best fits your question.</p>
          </div>
          <div className="space-y-3">
            <button type="button" onClick={() => {setShowOrderZoneForm(true); setFormMessage("");}} className="group flex w-full items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-[0_4px_12px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-orange-200">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><MapPinned className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold text-gray-900">Request an Order Zone</span><span className="mt-1 block text-xs leading-5 text-gray-500">Ask LIA Support for permission to order from a store outside your current zone and normal delivery radius.</span></span>
              <ChevronRight className="h-5 w-5 text-orange-500 transition group-hover:translate-x-0.5" />
            </button>
            <a href="mailto:support@liamarketplace.com" className="group flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_4px_12px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-orange-200 hover:bg-white">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><Mail className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold text-gray-900">Contact LIA Support</span><span className="mt-1 block text-xs leading-5 text-gray-500">Account questions, delivery concerns, or general help.</span></span>
              <ChevronRight className="h-5 w-5 text-orange-500 transition group-hover:translate-x-0.5" />
            </a>
            <a href="mailto:support@liamarketplace.com?subject=Report%20an%20issue" className="group flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_4px_12px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:border-red-200 hover:bg-white">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600"><FileWarning className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold text-gray-900">Report an issue</span><span className="mt-1 block text-xs leading-5 text-gray-500">Tell us about a technical problem or something that needs attention.</span></span>
              <ChevronRight className="h-5 w-5 text-red-500 transition group-hover:translate-x-0.5" />
            </a>
          </div>
        </section>

        {showOrderZoneForm && typeof document !== "undefined" && createPortal((
          <div
            className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
            onClick={() => setShowOrderZoneForm(false)}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="order-zone-title"
              onClick={(event) => event.stopPropagation()}
              className="relative max-h-[calc(100dvh-env(safe-area-inset-top)-1rem)] w-full max-w-lg overflow-y-auto rounded-t-[32px] border border-orange-100 bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6 shadow-2xl sm:rounded-[32px] sm:p-6"
            >
              <button type="button" onClick={() => setShowOrderZoneForm(false)} className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200" aria-label="Close Order Zone form"><X className="h-5 w-5" /></button>
              <div className="pr-10">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-50 text-orange-600"><MapPinned className="h-5 w-5" /></span>
                <h2 id="order-zone-title" className="mt-4 text-xl font-extrabold text-gray-900">Request an Order Zone</h2>
                <p className="mt-1 text-sm leading-6 text-gray-600">Tell us where you need delivery and the city of the store you want to shop from. Approval is not automatic; LIA will review the requested zone and delivery coverage first.</p>
              </div>
              <form onSubmit={submitOrderZoneRequest} className="mt-5 space-y-4">
                <label className="block text-sm font-bold text-gray-800">Your complete delivery address
                  <textarea required minLength={10} maxLength={300} value={customerAddress} onChange={(event) => setCustomerAddress(event.target.value)} rows={3} placeholder="Street address, city, state, ZIP" className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-3 text-sm font-medium outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
                </label>
                <label className="block text-sm font-bold text-gray-800">City of the store
                  <input required minLength={2} maxLength={100} value={storeCity} onChange={(event) => setStoreCity(event.target.value)} placeholder="Example: Cedar Rapids" className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-3 text-sm font-medium outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" />
                </label>
                {formMessage && <p className="rounded-xl bg-orange-50 px-3 py-2.5 text-sm font-semibold leading-5 text-orange-900" role="status">{formMessage}</p>}
                <button type="submit" disabled={submitting} className="w-full rounded-full bg-orange-500 py-3 text-sm font-extrabold text-white transition hover:bg-orange-600 disabled:opacity-60">{submitting ? "Sending request…" : "Send request to LIA Support"}</button>
              </form>
            </section>
          </div>
        ), document.body)}

        <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/75 p-4 text-sm leading-6 text-emerald-950">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <p><span className="font-extrabold">LIA is your point of contact.</span> We coordinate with the store when needed, so your support request stays private and easy to follow.</p>
        </div>
      </div>
      <CustomerBottomNavigation />
    </main>
  );
}

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
} from "lucide-react";
import Link from "next/link";
import {
  CustomerBottomNavigation,
} from "@/components/customer/navigation/CustomerBottomNavigation";

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-white pb-28">
      <header className="sticky top-0 z-20 bg-white/95 px-4 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl justify-center">
          <h1 className="text-xl font-extrabold tracking-tight text-gray-900">Help Center</h1>
        </div>
      </header>

      <div className="mx-auto max-w-xl space-y-6 px-4 py-5">
        <section className="relative overflow-hidden rounded-[28px] border border-orange-200/70 bg-gradient-to-br from-orange-100 via-amber-50 to-emerald-50 p-6 shadow-[0_18px_45px_rgba(249,115,22,0.10)]">
          <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-orange-300/30 blur-2xl" />
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

        <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/75 p-4 text-sm leading-6 text-emerald-950">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <p><span className="font-extrabold">LIA is your point of contact.</span> We coordinate with the store when needed, so your support request stays private and easy to follow.</p>
        </div>
      </div>
      <CustomerBottomNavigation />
    </main>
  );
}

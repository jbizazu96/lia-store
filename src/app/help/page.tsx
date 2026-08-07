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
  Mail,
  ShieldCheck,
} from "lucide-react";
import {
  CustomerBottomNavigation,
} from "@/components/customer/navigation/CustomerBottomNavigation";

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 pb-28">
      <section className="mx-auto max-w-xl rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
        <h1 className="text-3xl font-bold text-slate-900">Help Center</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Need help with your LIA account or delivery? Our support team is here to help.</p>

        <div className="mt-5 rounded-2xl border border-orange-100 bg-orange-50/70 p-4 text-sm leading-6 text-slate-700">
          <h2 className="font-bold text-slate-900">How support works</h2>
          <p className="mt-1.5">For an issue with a specific order, open that order and choose <strong>Get help with this order</strong>. Your request goes directly to LIA Admin, who will review it and coordinate with the store when needed.</p>
          <p className="mt-2">Use the options below for account questions, delivery concerns, or anything else you need help with.</p>
        </div>

        <div className="mt-6 space-y-3"><a href="mailto:support@liamarketplace.com" className="flex items-center gap-3 rounded-2xl bg-orange-50 p-4 font-semibold text-orange-800"><Mail className="h-5 w-5" />Contact Support</a><a href="mailto:support@liamarketplace.com?subject=Report%20an%20issue" className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4 font-semibold text-slate-800"><ShieldCheck className="h-5 w-5" />Report an issue</a></div>
      </section>
      <CustomerBottomNavigation />
    </main>
  );
}

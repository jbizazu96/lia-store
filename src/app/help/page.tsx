/*
|--------------------------------------------------------------------------
| Help Center
|--------------------------------------------------------------------------
|
| A small public starting point for marketplace support. It contains no
| account data and therefore does not access Firebase from the browser.
|
*/

import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  ShieldCheck,
} from "lucide-react";

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <section className="mx-auto max-w-xl rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-100">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-orange-600"><ArrowLeft className="h-4 w-4" />Back to LIA</Link>
        <h1 className="mt-6 text-3xl font-bold text-slate-900">Help Center</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Need help with your LIA account, deliveries, documents, or payouts? Our support team is here to help.</p>
        <div className="mt-6 space-y-3"><a href="mailto:support@liamarketplace.com" className="flex items-center gap-3 rounded-2xl bg-orange-50 p-4 font-semibold text-orange-800"><Mail className="h-5 w-5" />Contact Support</a><a href="mailto:support@liamarketplace.com?subject=Report%20an%20issue" className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4 font-semibold text-slate-800"><ShieldCheck className="h-5 w-5" />Report an issue</a></div>
      </section>
    </main>
  );
}


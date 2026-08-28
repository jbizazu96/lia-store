import type {Metadata} from "next";
import Link from "next/link";
import {ArrowLeft, MapPin, PackageCheck, ReceiptText, RefreshCw} from "lucide-react";

export const metadata: Metadata = {
  title: "How Taxes Are Calculated",
  description: "Learn how LIA estimates and finalizes sales tax for delivery and pickup orders.",
  alternates: {canonical: "/taxes"},
  robots: {index: false, follow: false},
  openGraph: {
    title: "How Taxes Are Calculated | LIA Marketplace",
    description: "How estimated and final sales tax work on LIA delivery and pickup orders.",
    url: "/taxes",
    type: "article",
  },
};

const factors = [
  {icon: PackageCheck, title: "What you purchase", text: "Products can have different tax treatment. LIA sends each product’s LIA-managed tax classification to Stripe Tax."},
  {icon: MapPin, title: "Where the order is fulfilled", text: "Delivery estimates use the delivery destination. Pickup estimates use the store location."},
  {icon: ReceiptText, title: "Order charges", text: "Applicable rules may also affect delivery and service fees. Optional tips are identified separately."},
  {icon: RefreshCw, title: "When the calculation occurs", text: "Rates and rules can change. LIA recalculates the complete order securely before payment is submitted."},
];

export default function TaxesPage() {
  return (
    <main className="min-h-screen bg-[#fffaf5] text-slate-950">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-14">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-orange-700">
          <ArrowLeft className="h-4 w-4" /> Back to LIA Marketplace
        </Link>

        <section className="mt-8 overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-[0_18px_60px_rgba(15,23,42,.07)]">
          <div className="bg-gradient-to-br from-orange-500 to-orange-700 px-6 py-10 text-white sm:px-10">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-100">Customer pricing</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">How taxes are calculated</h1>
            <p className="mt-4 max-w-2xl leading-7 text-orange-50">
              LIA displays an estimated tax before payment and uses Stripe Tax to calculate the final amount from the products, order charges, fulfillment method, and applicable location.
            </p>
          </div>

          <div className="space-y-10 px-6 py-8 sm:px-10 sm:py-10">
            <section>
              <h2 className="text-xl font-black">Estimated tax at checkout</h2>
              <p className="mt-3 leading-7 text-slate-600">
                The estimate helps you understand the expected order total before entering payment. It is based on current product prices and tax classifications, the selected delivery or pickup method, and the location used for that order.
              </p>
            </section>

            <div className="grid gap-3 sm:grid-cols-2">
              {factors.map(({icon: Icon, title, text}) => (
                <article key={title} className="rounded-xl border border-slate-100 bg-slate-50 p-5">
                  <Icon className="h-5 w-5 text-orange-600" />
                  <h2 className="mt-4 font-black">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
                </article>
              ))}
            </div>

            <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <h2 className="font-black text-amber-950">Why the final amount can differ</h2>
              <p className="mt-2 text-sm leading-6 text-amber-900">
                The final tax may be higher or lower if an item, quantity, price, fulfillment method, address, fee, or applicable tax rule changes before payment. LIA shows the finalized tax in the paid order record and receipt.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black">Refunds</h2>
              <p className="mt-3 leading-7 text-slate-600">
                When LIA completes an eligible full or partial refund, the corresponding applicable tax is handled through the refund calculation and recorded with the refund activity.
              </p>
            </section>

            <div className="flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row">
              <Link href="/register" className="inline-flex justify-center rounded-full bg-orange-600 px-6 py-3 text-sm font-black text-white hover:bg-orange-700">Create an account</Link>
              <Link href="/login" className="inline-flex justify-center rounded-full border border-slate-200 px-6 py-3 text-sm font-black text-slate-800 hover:border-orange-200">Sign in</Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

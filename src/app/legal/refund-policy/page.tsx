import Link from "next/link";
import {ArrowLeft, RotateCcw} from "lucide-react";
import {ManagedLegalDocumentContent} from "@/components/legal/ManagedLegalDocumentContent";
import {customerRefundIntroduction, customerRefundSections} from "@/content/legal/customerRefund";
import {CUSTOMER_REFUND_EFFECTIVE_DATE, CUSTOMER_REFUND_LAST_UPDATED, CUSTOMER_REFUND_VERSION} from "@/config/refundLegal";

export const metadata = {title: "Refund and Cancellation Policy | LIA Marketplace", description: "How LIA handles order cancellations, claims, evidence, and refunds."};

export default async function RefundPolicyPage({searchParams}: {searchParams: Promise<{embedded?: string}>}) {
  const embedded = (await searchParams).embedded === "1";
  const fallback = <><dl className="grid gap-2 border-b border-slate-200 pb-6 text-sm text-slate-600 sm:grid-cols-2"><div><dt className="font-bold text-slate-900">Effective date</dt><dd>{CUSTOMER_REFUND_EFFECTIVE_DATE}</dd></div><div><dt className="font-bold text-slate-900">Last updated</dt><dd>{CUSTOMER_REFUND_LAST_UPDATED}</dd></div><div className="sm:col-span-2"><dt className="font-bold text-slate-900">Version</dt><dd>{CUSTOMER_REFUND_VERSION}</dd></div></dl><div className="mt-6 space-y-4 text-sm leading-7 text-slate-700">{customerRefundIntroduction.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div><div className="mt-9 space-y-9">{customerRefundSections.map((section) => <section key={section.title}><h2 className="text-lg font-black">{section.title}</h2><div className="mt-3 space-y-3 text-sm leading-7 text-slate-700">{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div></section>)}</div></>;
  return <main className="min-h-screen bg-slate-50 text-slate-900">{!embedded ? <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-5"><Link href="/legal" aria-label="Back to legal documents" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100"><ArrowLeft className="h-5 w-5"/></Link><RotateCcw className="h-6 w-6 text-orange-600"/><div><p className="text-xs font-bold uppercase tracking-wider text-orange-700">LIA Marketplace</p><h1 className="text-xl font-black">Refund and Cancellation Policy</h1></div></div></header> : null}<article className={`mx-auto max-w-3xl px-4 ${embedded ? "py-4" : "py-8 sm:py-12"}`}><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"><ManagedLegalDocumentContent documentKey="customer_refund_policy" fallback={fallback}/></div></article></main>;
}

import Link from "next/link";
import {ChevronRight, FileText, ShieldCheck, Trash2} from "lucide-react";
import {LegalHubBackLink} from "@/components/legal/LegalHubBackLink";
import {legalDocumentHref, legalReturnPath} from "@/services/navigation/legalReturnPath";

const documents = [
  {title: "Customer Terms of Service", description: "The agreement governing customer accounts, orders, payments, delivery, refunds, and use of LIA.", href: "/legal/customer-terms", icon: FileText},
  {title: "Privacy Policy", description: "How LIA collects, uses, shares, protects, retains, and deletes personal information.", href: "/legal/privacy", icon: ShieldCheck},
  {title: "Account deletion", description: "How customer deletion requests, review, retention, and permanent removal are handled.", href: "/legal/account-deletion", icon: Trash2},
] as const;

export const metadata = {title: "Legal Documents | LIA Marketplace"};

export default async function LegalPage({searchParams}: {searchParams: Promise<{returnTo?: string}>}) {
  const returnTo = legalReturnPath((await searchParams).returnTo);
  return <main className="min-h-screen bg-white pb-10">
    <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 backdrop-blur-xl">
      <div className="relative mx-auto flex max-w-xl items-center justify-center px-4 py-4">
        <LegalHubBackLink returnTo={returnTo}/><h1 className="text-xl font-black">Legal documents</h1>
      </div>
    </header>
    <div className="mx-auto max-w-xl space-y-5 px-4 py-6">
      <section className="rounded-2xl bg-gradient-to-br from-orange-50 via-amber-50 to-white p-5 shadow-[0_12px_35px_rgba(249,115,22,.08)]">
        <p className="text-xs font-bold uppercase tracking-[.12em] text-orange-700">LIA Marketplace</p><h2 className="mt-2 text-xl font-black">Policies built for transparency</h2><p className="mt-2 text-sm leading-6 text-slate-600">These documents are publicly available whether or not you have a LIA account.</p>
      </section>
      <div className="space-y-3">{documents.map(({title, description, href, icon: Icon}) => <Link key={title} href={legalDocumentHref(href, returnTo)} className="flex items-center gap-4 rounded-xl border border-slate-200 p-4 transition hover:border-orange-200 hover:bg-orange-50/40"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><Icon className="h-5 w-5"/></span><span className="min-w-0 flex-1"><span className="block font-black">{title}</span><span className="mt-1 block text-sm leading-5 text-slate-600">{description}</span></span><ChevronRight className="h-5 w-5 shrink-0 text-slate-400"/></Link>)}</div>
      <p className="px-1 text-xs leading-5 text-slate-500">Legal and support questions can be sent to <a className="font-bold text-orange-700" href="mailto:info@liamarketplace.com">info@liamarketplace.com</a>.</p>
    </div>
  </main>;
}

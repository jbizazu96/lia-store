import Image from "next/image";
import Link from "next/link";
import type {Metadata} from "next";
import {
  ArrowRight,
  BadgeDollarSign,
  BarChart3,
  ChevronRight,
  CircleCheck,
  Clock3,
  HeartHandshake,
  MapPin,
  PackageCheck,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
} from "lucide-react";
import {PublicSupportButton} from "@/components/public/PublicSupportButton";

export const metadata: Metadata = {
  title: "LIA Marketplace | Local delivery for independent stores",
  description: "LIA Marketplace connects customers with independent local and international stores for convenient shopping and delivery.",
  alternates: {canonical: "/"},
  robots: {index: true, follow: true},
};

const marketplaceSteps = [
  {icon: MapPin, number: "01", title: "Find nearby stores", description: "Set your delivery address and discover independent stores available in your market."},
  {icon: ShoppingBag, number: "02", title: "Shop with confidence", description: "Browse real store inventory, review your delivery price, and pay securely."},
  {icon: PackageCheck, number: "03", title: "Follow every step", description: "Receive order updates from confirmation through pickup and delivery."},
];

const partnerBenefits = [
  {icon: Store, title: "Your digital storefront", description: "Manage products, inventory, availability, and orders from one practical workspace."},
  {icon: BadgeDollarSign, title: "Built for small business", description: "A marketplace designed around sustainable partnerships with independent merchants."},
  {icon: Truck, title: "Delivery coordination", description: "Connect customer orders with an organized delivery workflow and live status updates."},
  {icon: BarChart3, title: "Clear business reporting", description: "Review authoritative sales, order, product, and earnings information."},
];

const audiences = [
  {icon: ShoppingBag, label: "Customers", title: "The stores you value, delivered.", description: "Discover specialty groceries and local essentials from independent businesses near you.", href: "/register", action: "Create customer account", tone: "bg-orange-50 text-orange-700"},
  {icon: Store, label: "Store owners", title: "Reach customers beyond your door.", description: "Bring your catalog online, receive paid orders, and manage fulfillment without losing sight of your business.", href: "/register", action: "Become a store partner", tone: "bg-emerald-50 text-emerald-700"},
  {icon: Truck, label: "Drivers", title: "Help local commerce move.", description: "Join LIA's delivery network and keep assignments, delivery progress, and earnings organized.", href: "/register", action: "Apply to drive", tone: "bg-sky-50 text-sky-700"},
];

export default function HomePage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "LIA Marketplace",
    alternateName: "LIA",
    url: "https://www.liamarketplace.com/",
    description: "A local marketplace and delivery platform connecting customers with independent local and international stores.",
    publisher: {
      "@type": "Organization",
      name: "LIA Marketplace",
      url: "https://www.liamarketplace.com/",
      logo: "https://www.liamarketplace.com/brand/lia-logo-white-background-512.png",
      email: "info@liamarketplace.com",
    },
  };
  return (
    <main className="min-h-screen overflow-hidden bg-white text-slate-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(structuredData)}} />
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/60 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:h-18 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label="LIA Marketplace home">
            <Image src="/brand/lia-logo-transparent-256.png" alt="LIA" width={72} height={38} className="h-9 w-[72px] object-contain" priority />
            <div className="min-w-0 leading-none">
              <span className="hidden text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 sm:block">Marketplace</span>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-600 lg:flex" aria-label="Main navigation">
            <Link href="#how-it-works" className="transition hover:text-orange-600">How it works</Link>
            <Link href="#partners" className="transition hover:text-orange-600">For partners</Link>
            <Link href="#community" className="transition hover:text-orange-600">Why LIA</Link>
            <PublicSupportButton className="transition hover:text-orange-600">Help</PublicSupportButton>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Link href="/login" className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-extrabold text-slate-800 shadow-sm transition hover:border-orange-200 hover:text-orange-700 sm:px-5 sm:text-sm">
              Sign in
            </Link>
            <Link href="/register" className="rounded-full bg-orange-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-sm shadow-orange-200 transition hover:bg-orange-700 sm:px-5 sm:text-sm">
              Join LIA
            </Link>
          </div>
        </div>
      </header>

      <section className="relative isolate bg-[#fffaf5] pb-18 pt-28 sm:pb-24 sm:pt-36">
        <div className="absolute -left-28 top-24 -z-10 h-72 w-72 rounded-full bg-orange-200/40 blur-3xl" />
        <div className="absolute -right-28 top-10 -z-10 h-96 w-96 rounded-full bg-emerald-100/70 blur-3xl" />
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:px-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/80 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.13em] text-orange-700 shadow-sm">
              <Sparkles className="h-3.5 w-3.5" /> LIA Marketplace · Shop local. Grow together.
            </div>
            <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.04] tracking-[-0.045em] text-slate-950 sm:text-6xl lg:text-7xl">
              Local stores deserve a <span className="text-orange-600">better way</span> to deliver.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
              LIA connects customers with independent local and international stores through one thoughtful marketplace—built to make discovery, ordering, and delivery easier.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-full bg-orange-600 px-6 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-orange-200 transition hover:-translate-y-0.5 hover:bg-orange-700">
                Get started <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/login" className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3.5 text-sm font-extrabold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-200">
                Open your account
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-3 text-xs font-bold text-slate-600 sm:text-sm">
              {[
                "Secure payments",
                "Protected account access",
                "Real delivery updates",
              ].map((item) => <span key={item} className="flex items-center gap-2"><CircleCheck className="h-4 w-4 text-emerald-600" />{item}</span>)}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:mx-0">
            <div className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-orange-200/70 to-emerald-100/70 blur-xl" />
            <div className="relative overflow-hidden rounded-[1.75rem] border border-white bg-slate-950 p-4 shadow-2xl shadow-slate-300/60 sm:p-6">
              <div className="flex items-center justify-between text-white">
                <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-300">Your neighborhood</p><p className="mt-1 text-xl font-black">One marketplace</p></div>
                <div className="rounded-full bg-white/10 p-3"><MapPin className="h-5 w-5 text-orange-300" /></div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="col-span-2 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-700 p-5 text-white">
                  <div className="flex items-start justify-between"><ShoppingBag className="h-7 w-7"/><span className="rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider">Customer</span></div>
                  <p className="mt-9 text-xl font-black">Find something familiar.</p><p className="mt-1 text-sm text-orange-50">Explore local stores and specialty products in your delivery area.</p>
                </div>
                <div className="rounded-2xl bg-white p-4 text-slate-950"><Store className="h-6 w-6 text-emerald-600"/><p className="mt-7 font-black">Independent stores</p><p className="mt-1 text-xs leading-5 text-slate-500">A storefront built around their business.</p></div>
                <div className="rounded-2xl bg-white p-4 text-slate-950"><Truck className="h-6 w-6 text-sky-600"/><p className="mt-7 font-black">Local delivery</p><p className="mt-1 text-xs leading-5 text-slate-500">Clear progress from store to door.</p></div>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"><div className="flex items-center gap-3"><Clock3 className="h-5 w-5 text-orange-300"/><div><p className="text-xs text-slate-400">Built for real communities</p><p className="text-sm font-bold">Customers · Stores · Drivers</p></div></div><ChevronRight className="h-5 w-5 text-slate-500"/></div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-20 py-18 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl"><p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600">For customers</p><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">From discovery to your door.</h2><p className="mt-4 leading-7 text-slate-600">LIA keeps the shopping journey straightforward, with pricing and order progress visible along the way.</p></div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {marketplaceSteps.map((step) => <article key={step.number} className="relative rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,.06)]"><span className="absolute right-5 top-4 text-4xl font-black text-slate-100">{step.number}</span><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><step.icon className="h-6 w-6"/></div><h3 className="mt-7 text-lg font-black">{step.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p></article>)}
          </div>
        </div>
      </section>

      <section id="partners" className="scroll-mt-20 bg-slate-950 py-18 text-white sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]">
            <div><p className="text-xs font-black uppercase tracking-[0.18em] text-orange-400">For store partners</p><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Technology that respects the business behind the store.</h2><p className="mt-5 max-w-xl leading-7 text-slate-300">LIA is being built for independent businesses that need practical marketplace and delivery tools—not a platform that gets in the way.</p><Link href="/register" className="mt-8 inline-flex items-center gap-2 rounded-full bg-orange-600 px-6 py-3 text-sm font-extrabold text-white transition hover:bg-orange-500">Partner with LIA <ArrowRight className="h-4 w-4"/></Link></div>
            <div className="grid gap-3 sm:grid-cols-2">{partnerBenefits.map((benefit) => <article key={benefit.title} className="rounded-2xl border border-white/10 bg-white/[.06] p-5"><benefit.icon className="h-6 w-6 text-orange-400"/><h3 className="mt-5 font-black">{benefit.title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{benefit.description}</p></article>)}</div>
          </div>
        </div>
      </section>

      <section id="community" className="scroll-mt-20 py-18 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center"><p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600">One connected community</p><h2 className="mx-auto mt-3 max-w-3xl text-3xl font-black tracking-tight sm:text-5xl">A useful experience for everyone who makes local delivery possible.</h2></div>
          <div className="mt-10 grid gap-4 lg:grid-cols-3">{audiences.map((audience) => <article key={audience.label} className="group rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,.06)] transition hover:-translate-y-1 hover:shadow-[0_18px_50px_rgba(15,23,42,.1)]"><div className={`flex h-12 w-12 items-center justify-center rounded-xl ${audience.tone}`}><audience.icon className="h-6 w-6"/></div><p className="mt-6 text-xs font-black uppercase tracking-[0.15em] text-slate-400">{audience.label}</p><h3 className="mt-2 text-xl font-black">{audience.title}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{audience.description}</p><Link href={audience.href} className="mt-6 inline-flex items-center gap-1 text-sm font-extrabold text-orange-700">{audience.action}<ChevronRight className="h-4 w-4 transition group-hover:translate-x-1"/></Link></article>)}</div>
        </div>
      </section>

      <section className="px-4 pb-18 sm:px-6 sm:pb-24">
        <div className="mx-auto max-w-7xl overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-orange-500 to-orange-700 px-6 py-10 text-white shadow-xl shadow-orange-200 sm:px-10 sm:py-14 lg:flex lg:items-center lg:justify-between">
          <div className="max-w-2xl"><HeartHandshake className="h-8 w-8 text-orange-100"/><h2 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">Better delivery starts with stronger local connections.</h2><p className="mt-4 leading-7 text-orange-50">Create an account as a customer, store owner, or driver and become part of the LIA marketplace.</p></div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row lg:mt-0 lg:pl-8"><Link href="/register" className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-black text-orange-700 shadow-sm">Join LIA <ArrowRight className="h-4 w-4"/></Link><PublicSupportButton className="inline-flex items-center justify-center rounded-full border border-white/50 px-6 py-3 text-sm font-black text-white">Visit Help Center</PublicSupportButton></div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-[1.3fr_1fr_1fr]">
            <div><div className="flex items-center gap-3"><Image src="/brand/lia-logo-transparent-256.png" alt="LIA" width={84} height={44} className="h-11 w-[84px] object-contain"/><div><p className="font-black">Marketplace</p><p className="text-xs text-slate-500">Local marketplace and delivery</p></div></div><p className="mt-4 max-w-sm text-sm leading-6 text-slate-600">Helping independent stores serve their communities through thoughtful technology and reliable delivery coordination.</p></div>
            <div><p className="text-sm font-black">Explore</p><div className="mt-4 grid gap-3 text-sm text-slate-600"><Link href="#how-it-works" className="hover:text-orange-700">How it works</Link><Link href="#partners" className="hover:text-orange-700">For store partners</Link><Link href="/register" className="hover:text-orange-700">Create an account</Link><Link href="/login" className="hover:text-orange-700">Sign in</Link></div></div>
            <div><p className="text-sm font-black">Support and legal</p><div className="mt-4 grid gap-3 text-sm text-slate-600"><PublicSupportButton className="text-left hover:text-orange-700">Contact support</PublicSupportButton><a href="mailto:info@liamarketplace.com" className="hover:text-orange-700">info@liamarketplace.com</a><Link href="/legal" className="hover:text-orange-700">Legal documents</Link><Link href="/legal/customer-terms" className="hover:text-orange-700">Customer Terms</Link><Link href="/legal/refund-policy" className="hover:text-orange-700">Refund and Cancellation Policy</Link><a href="tel:+18336724143" className="hover:text-orange-700">(833) 672-4143</a></div></div>
          </div>
          <div className="mt-10 flex flex-col gap-3 border-t border-slate-200 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between"><p>&copy; {new Date().getFullYear()} LIA Marketplace. All rights reserved.</p><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600"/><span>Secure account and payment experiences</span></div></div>
        </div>
      </footer>
    </main>
  );
}

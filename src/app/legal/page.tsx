import Link from "next/link";
import { ArrowLeft, FileText, ShieldCheck, Trash2 } from "lucide-react";

const sections = [
  {
    title: "Privacy",
    icon: ShieldCheck,
    text: "LIA uses account, delivery, order, and payment-related information to operate the marketplace, fulfill purchases, prevent fraud, and provide customer support. Payment card details are handled by Stripe and are not stored by LIA.",
  },
  {
    title: "Marketplace terms",
    icon: FileText,
    text: "Prices, availability, delivery estimates, fees, promotions, and store hours can change. Your final checkout review shows the applicable order total before payment is submitted.",
  },
  {
    title: "Account deletion",
    icon: Trash2,
    text: "You can request deletion from Profile. Submission immediately locks account access while the request is reviewed. Approved requests follow the displayed grace period before eligible account data is permanently removed.",
  },
] as const;

export default function LegalPage() {
  return (
    <main className="min-h-screen bg-white pb-[max(2rem,env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-20 bg-white/95 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="relative mx-auto flex max-w-xl items-center justify-center">
          <Link
            href="/profile"
            aria-label="Back to profile"
            className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-extrabold tracking-tight text-gray-900">
            Legal
          </h1>
        </div>
      </header>

      <div className="mx-auto max-w-xl space-y-5 px-4 py-5">
        <section className="rounded-3xl bg-gradient-to-br from-orange-50 via-amber-50 to-white p-5 shadow-[0_12px_35px_rgba(249,115,22,0.08)]">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-orange-700">
            LIA Marketplace
          </p>
          <h2 className="mt-2 text-xl font-extrabold text-gray-900">
            Policies in plain language
          </h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            Review how customer information, purchases, and account requests
            are handled.
          </p>
        </section>

        {sections.map(({ title, icon: Icon, text }) => (
          <section key={title} className="rounded-2xl border border-gray-200 p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                <Icon className="h-5 w-5" />
              </span>
              <h2 className="font-extrabold text-gray-900">{title}</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-gray-600">{text}</p>
          </section>
        ))}

        <p className="px-1 text-xs leading-5 text-gray-500">
          Questions about these policies can be sent to{" "}
          <a className="font-bold text-orange-700" href="mailto:support@liamarketplace.com">
            support@liamarketplace.com
          </a>.
        </p>
      </div>
    </main>
  );
}

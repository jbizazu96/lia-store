import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Database,
  LogIn,
  Mail,
  ShieldCheck,
  Trash2,
} from "lucide-react";

export const metadata = {
  title: "Delete Your LIA Marketplace Account",
  description:
    "Request permanent deletion of a LIA Marketplace customer account and its associated data.",
  alternates: {canonical: "/legal/account-deletion"},
};

const deletedData = [
  "Your LIA Marketplace customer profile and Firebase Authentication account",
  "Saved delivery addresses, cart, preferences, notification history, and registered push devices",
  "Customer profile images, refund-evidence uploads, and other files stored under your account",
  "Active checkout sessions and the Stripe customer profile used by LIA",
];

const retainedData = [
  "Order, payment, tax, accounting, refund, and chargeback records where retention is legally or operationally required",
  "Fraud-prevention, security, investigation, legal, regulatory, and audit records where retention is permitted or required",
];

export default function AccountDeletionInformationPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-5">
          <Link
            href="/legal"
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100"
            aria-label="Back to LIA Marketplace legal documents"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Trash2 className="h-6 w-6 text-orange-600" />
          <h1 className="text-xl font-black">Delete your LIA Marketplace account</h1>
        </div>
      </header>

      <article className="mx-auto max-w-2xl space-y-5 px-4 py-8">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-2xl font-black">Request permanent deletion</h2>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            This page is the public account-deletion resource for the LIA
            Marketplace customer app. You can request deletion even if you no
            longer have the app installed.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-orange-600 px-5 py-3 text-sm font-bold text-white hover:bg-orange-700"
            >
              <LogIn className="h-4 w-4" />
              Sign in to request deletion
            </Link>
            <a
              href="mailto:info@liamarketplace.com?subject=LIA%20Marketplace%20Customer%20Account%20Deletion%20Request"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-orange-200 px-5 py-3 text-sm font-bold text-orange-700 hover:bg-orange-50"
            >
              <Mail className="h-4 w-4" />
              Email a deletion request
            </a>
          </div>

          <div className="mt-6 rounded-xl bg-orange-50 p-4 text-sm leading-6 text-orange-950">
            <p className="font-bold">If you can sign in</p>
            <p className="mt-1">
              Open Profile, choose Delete account, confirm your identity, and
              submit the request. Submission immediately locks account access
              while the request is reviewed.
            </p>
          </div>

          <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            <p className="font-bold text-slate-900">If you cannot sign in</p>
            <p className="mt-1">
              Email <strong>info@liamarketplace.com</strong> from the address
              associated with your LIA account. Include “Customer Account
              Deletion Request” in the subject. LIA will verify ownership
              before processing the request; never send your password or card
              information.
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-2">
            <Clock3 className="h-5 w-5 text-orange-600" />
            <h2 className="text-lg font-black">Timeline and cancellation</h2>
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            LIA reviews the request and confirms that active orders, refunds,
            disputes, or other unresolved obligations do not prevent safe
            deletion. Approved requests normally receive a 30-day grace period
            before permanent deletion. The scheduled date may vary, but cannot
            be more than 90 days after approval. If more information or time is
            required, LIA will explain the next step.
          </p>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            You may ask LIA Support to cancel the request before destructive
            processing begins. Once processing starts, deletion may no longer
            be reversible.
          </p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-black">Data deleted or de-identified</h2>
          </div>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            {deletedData.map((item) => (
              <li key={item} className="flex gap-3">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm leading-7 text-slate-600">
            Historical orders, reviews, and support or refund records that must
            remain are disconnected from the deleted account and anonymized or
            minimized where practical.
          </p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-slate-600" />
            <h2 className="text-lg font-black">Limited records that may be retained</h2>
          </div>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            {retainedData.map((item) => (
              <li key={item} className="flex gap-3">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm leading-7 text-slate-600">
            Retained records are limited to the applicable purpose and handled
            under the LIA Marketplace Privacy Policy. Retention does not keep
            the customer account active or allow the customer to sign in.
          </p>
          <Link
            href="/legal/privacy"
            className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-orange-700 hover:text-orange-800"
          >
            <ShieldCheck className="h-4 w-4" />
            Read the Privacy Policy
          </Link>
        </section>
      </article>
    </main>
  );
}

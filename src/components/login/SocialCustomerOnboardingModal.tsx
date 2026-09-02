"use client";

import {useState} from "react";
import {CheckCircle2, X} from "lucide-react";
import {LegalReviewModal} from "@/components/legal/LegalReviewModal";
import {formatPhoneNumber} from "@/utils/phone";

interface SocialCustomerOnboardingModalProps {
  initialName: string;
  providerName: "Google" | "Apple";
  loading: boolean;
  error: string;
  onCancel: () => void;
  onSubmit: (input: {
    fullName: string;
    phone: string;
    customerTermsAccepted: boolean;
    customerPrivacyAcknowledged: boolean;
  }) => void;
}

export function SocialCustomerOnboardingModal({
  initialName,
  providerName,
  loading,
  error,
  onCancel,
  onSubmit,
}: SocialCustomerOnboardingModalProps) {
  const [fullName, setFullName] = useState(initialName);
  const [phone, setPhone] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [reviewing, setReviewing] = useState<"customer_terms" | "customer_privacy" | null>(null);

  const complete = fullName.trim().length > 0 &&
    phone.replace(/\D/g, "").length === 10 &&
    termsAccepted &&
    privacyAcknowledged;

  return <>
    <div className="fixed inset-0 z-[250] flex items-end justify-center bg-slate-950/55 backdrop-blur-[2px] sm:items-center sm:p-5">
      <section role="dialog" aria-modal="true" aria-labelledby="social-profile-title" className="w-full max-w-md rounded-t-2xl bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-orange-600">One last step</p>
            <h2 id="social-profile-title" className="mt-1 text-xl font-black text-slate-950">Complete your customer profile</h2>
            <p className="mt-1 text-sm leading-5 text-slate-600">Your {providerName} sign-in is connected. Add the information LIA needs for shopping and delivery.</p>
          </div>
          <button type="button" onClick={onCancel} disabled={loading} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 disabled:opacity-50" aria-label="Cancel account setup"><X className="h-5 w-5"/></button>
        </div>

        {error ? <p role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        <div className="mt-5 space-y-4">
          <label className="block text-sm font-semibold text-slate-700">Full name
            <input type="text" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} disabled={loading} maxLength={100} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" placeholder="Your full name"/>
          </label>
          <label className="block text-sm font-semibold text-slate-700">Phone number
            <input type="tel" inputMode="numeric" autoComplete="tel" value={phone} onChange={(event) => setPhone(formatPhoneNumber(event.target.value))} disabled={loading} maxLength={18} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" placeholder="(000) 000 - 0000"/>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm leading-5 text-slate-700">
            <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} disabled={loading} className="mt-1 h-4 w-4 accent-orange-600"/>
            <span>I agree to the <button type="button" onClick={() => setReviewing("customer_terms")} className="font-bold text-orange-700 underline underline-offset-2">LIA Customer Terms of Service</button>.</span>
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm leading-5 text-slate-700">
            <input type="checkbox" checked={privacyAcknowledged} onChange={(event) => setPrivacyAcknowledged(event.target.checked)} disabled={loading} className="mt-1 h-4 w-4 accent-orange-600"/>
            <span>I acknowledge that I have read the <button type="button" onClick={() => setReviewing("customer_privacy")} className="font-bold text-orange-700 underline underline-offset-2">LIA Privacy Policy</button>.</span>
          </label>
        </div>

        <button type="button" disabled={loading || !complete} onClick={() => onSubmit({fullName, phone, customerTermsAccepted: termsAccepted, customerPrivacyAcknowledged: privacyAcknowledged})} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-orange-600 px-5 py-3 font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"/> : <><CheckCircle2 className="h-5 w-5"/>Continue</>}
        </button>
      </section>
    </div>
    {reviewing ? <LegalReviewModal documents={[{key: "customer_terms", title: "Customer Terms", path: "/legal/customer-terms"}, {key: "customer_privacy", title: "Privacy Policy", path: "/legal/privacy"}]} initialKey={reviewing} decisionRequired={false} onClose={() => setReviewing(null)}/> : null}
  </>;
}

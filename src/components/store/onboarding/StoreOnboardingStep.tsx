"use client";

/*
  Shared Store Onboarding Step.

  Each onboarding route supplies a step name to this component. The
  component renders the correct form, validates its required fields,
  and delegates all Firestore and Storage work to the onboarding service.
*/
import { useEffect, useState } from "react";
import Image from "next/image";
import { ArrowLeft, ArrowRight, CheckCircle2, Camera, Upload } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandedLoader } from "@/components/ui/BrandedLoader";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useStoreOnboarding } from "@/hooks/useStoreOnboarding";
import { storeOnboardingService } from "@/services/store/storeOnboardingService";
import { getStoreScheduleValidationError } from "@/services/store/storeScheduleValidation";
import { formatPhoneNumber } from "@/utils/phone";
import { isStripeConnectClientError, stripeConnectClientService } from "@/services/payment/stripeConnectClientService";
import { DEFAULT_STORE_SCHEDULE, ONBOARDING_STEPS, type StoreOnboardingStep } from "@/types/storeOnboarding";
import type { StoreScheduleDay } from "@/types/store";
import {UsStateSelect} from "@/components/ui/UsStateSelect";

/*
  Customer-facing title and helper text for each onboarding step.
*/
const stepMeta: Record<StoreOnboardingStep, { title: string; subtitle: string }> = {
  owner: { title: "Store owner information", subtitle: "Tell us who owns and manages this store." },
  "store-information": { title: "Store information", subtitle: "Add the customer-facing details for your store." },
  "business-information": { title: "Business information", subtitle: "Provide the legal details Stripe and LIA need." },
  schedule: { title: "Store schedule", subtitle: "Choose the days and hours your store is open." },
  stripe: { title: "Set up payouts", subtitle: "Stripe securely collects banking and identity details for payouts." },
};
/*
  Reusable text input used throughout the onboarding forms.
*/
const Input = ({ label, required, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; required?: boolean }) => <label className="block text-sm font-medium text-gray-700">{label}{required && " *"}<input {...props} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></label>;

const StateSelect = ({label, value, onChange}: {label: string; value: string; onChange: (value: string) => void}) => <label className="block text-sm font-medium text-gray-700">{label} *<UsStateSelect required value={value} onChange={onChange} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></label>;

/*
  Format a United States EIN as 00-0000000 while preserving only its nine
  digits. The EIN is optional, so validation remains Stripe's responsibility.
*/
function formatEin(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 9);

  return digits.length <= 2
    ? digits
    : `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

/*
  One image-upload surface with a mobile-friendly choice between taking
  a photo and selecting an existing image. Files are uploaded only after
  the user saves the current onboarding step.
*/
function ImageUpload({ label, required, preview, onSelect, contain = false }: { label: string; required?: boolean; preview?: string; onSelect: (file: File | null) => void; contain?: boolean }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const choose = (file: File | null) => { onSelect(file); setPickerOpen(false); };
  return <div><p className="mb-2 text-sm font-medium text-gray-700">{label}{required && " *"}</p><button type="button" onClick={() => setPickerOpen(true)} className="relative flex aspect-[4/3] w-full flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 text-center transition hover:border-orange-500">{preview ? <img src={preview} alt={`${label} preview`} className={`h-full w-full ${contain ? "object-contain p-2" : "object-cover"}`} /> : <><Upload className="mb-2 h-7 w-7 text-gray-400" /><span className="text-xs font-medium text-gray-600">Tap to add {label.toLowerCase()}</span><span className="mt-1 text-[10px] text-gray-400">Take a photo or upload one</span></>}</button>{pickerOpen ? <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-4 sm:items-center sm:justify-center"><div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl"><h3 className="text-lg font-bold text-gray-900">Add {label}</h3><p className="mt-1 text-sm text-gray-500">Choose how you want to add this image.</p><div className="mt-5 grid grid-cols-2 gap-3"><label className="flex cursor-pointer flex-col items-center rounded-2xl border border-gray-200 p-4 hover:bg-orange-50"><Camera className="mb-2 h-7 w-7 text-orange-600" /><span className="text-sm font-semibold">Take photo</span><input hidden type="file" accept="image/*" capture="environment" onChange={(e) => choose(e.target.files?.[0] ?? null)} /></label><label className="flex cursor-pointer flex-col items-center rounded-2xl border border-gray-200 p-4 hover:bg-orange-50"><Upload className="mb-2 h-7 w-7 text-orange-600" /><span className="text-sm font-semibold">Upload image</span><input hidden type="file" accept="image/*" onChange={(e) => choose(e.target.files?.[0] ?? null)} /></label></div><button type="button" onClick={() => setPickerOpen(false)} className="mt-4 w-full rounded-xl py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancel</button></div></div> : null}</div>;
}

export function StoreOnboardingStep({ step }: { step: StoreOnboardingStep }) {
  return <RoleGuard allowedAccountTypes={["store_owner"]}><ProtectedRoute><StoreOnboardingStepContent step={step} /></ProtectedRoute></RoleGuard>;
}

function StoreOnboardingStepContent({ step }: { step: StoreOnboardingStep }) {
  const router = useRouter(); const searchParams = useSearchParams(); const { user, draft, loading, error } = useStoreOnboarding();
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const [owner, setOwner] = useState({ firstName: "", lastName: "", email: "", phone: "", address: "", city: "", state: "", zip: "" }); const [photo, setPhoto] = useState<File | null>(null); const [photoPreview, setPhotoPreview] = useState("");
  const [store, setStore] = useState({ name: "", email: "", phone: "", description: "", address: "", city: "", state: "", zip: "" }); const [logo, setLogo] = useState<File | null>(null); const [banner, setBanner] = useState<File | null>(null); const [logoPreview, setLogoPreview] = useState(""); const [bannerPreview, setBannerPreview] = useState("");
  const [business, setBusiness] = useState({ businessType: "", registeredName: "", ein: "", businessStructure: "" }); const [storeFront, setStoreFront] = useState<File | null>(null); const [storeInside, setStoreInside] = useState<File | null>(null); const [storeFrontPreview, setStoreFrontPreview] = useState(""); const [storeInsidePreview, setStoreInsidePreview] = useState(""); const [schedule, setSchedule] = useState<StoreScheduleDay[]>(DEFAULT_STORE_SCHEDULE);
  const [stripeStatus, setStripeStatus] = useState(draft?.stripeAccountStatus); const [connecting, setConnecting] = useState(false);
  useEffect(() => { if (!draft) return; setOwner({ firstName: draft.owner.firstName, lastName: draft.owner.lastName, email: draft.owner.email, phone: draft.owner.phone, address: draft.owner.address, city: draft.owner.city, state: draft.owner.state, zip: draft.owner.zip }); setStore({ name: draft.name, email: draft.email, phone: draft.phone, description: draft.description, address: draft.address, city: draft.city, state: draft.state, zip: draft.zip }); setBusiness({ businessType: draft.businessType, registeredName: draft.registeredName, ein: draft.ein, businessStructure: draft.businessStructure }); setSchedule(draft.schedule); setStripeStatus(draft.stripeAccountStatus); }, [draft]);
  useEffect(() => { if (step !== "stripe" || searchParams.get("stripe") !== "return" || !draft?.storeId) return; void stripeConnectClientService.getAccountStatus(draft.storeId).then((result) => setStripeStatus(result.account?.onboardingStatus)).catch(() => setMessage("We couldn't refresh Stripe yet. Please try again.")); }, [draft?.storeId, searchParams, step]);
  if (loading) return <BrandedLoader message="Loading store onboarding" />; if (!user || !draft) return null;
  const policy = draft.applicationPolicy;
  const ownerPhotoRequired = policy?.requiredDocuments.ownerPhotoId ?? true;
  const logoRequired = policy?.requiredDocuments.logo ?? true;
  const bannerRequired = policy?.requiredDocuments.banner ?? false;
  const storeFrontRequired = policy?.requiredDocuments.storeFront ?? true;
  const storeInsideRequired = policy?.requiredDocuments.storeInside ?? true;
  const stripeRequired = policy?.requireStripeAccount ?? true;
  const index = ONBOARDING_STEPS.indexOf(step); const next = ONBOARDING_STEPS[index + 1]; const back = ONBOARDING_STEPS[index - 1];
  const navigate = (destination: StoreOnboardingStep) => router.push(storeOnboardingService.pathFor(destination));
  const scheduleValidationError = getStoreScheduleValidationError(schedule);
  const save = async () => { setSaving(true); setMessage(null); try { if (step === "owner") await storeOnboardingService.saveOwner(user.uid, owner, photo); if (step === "store-information") await storeOnboardingService.saveStoreInformation(user.uid, { ...store, logo, banner }); if (step === "business-information") await storeOnboardingService.saveBusinessInformation(user.uid, { ...business, storeFront, storeInside }); if (step === "schedule") await storeOnboardingService.saveSchedule(user.uid, schedule); if (next) navigate(next); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Unable to save this step."); setSaving(false); } };
  const connectStripe = async () => { if (!draft.storeId) return; setConnecting(true); setMessage(null); try { await stripeConnectClientService.createOrRetrieveAccount(draft.storeId); const result = await stripeConnectClientService.createOnboardingLink(draft.storeId, "onboarding"); window.location.assign(result.onboarding.url); } catch (cause) { setMessage(isStripeConnectClientError(cause) ? cause.message : "Stripe onboarding could not be started."); setConnecting(false); } };
  const canFinishStripe = !stripeRequired || stripeStatus === "complete" || stripeStatus === "pending_verification";
  const returnedFromStripe = searchParams.get("stripe") === "return";
  const selectImage = (file: File | null, setFile: (value: File | null) => void, setPreview: (value: string) => void) => { setFile(file); setPreview(file ? URL.createObjectURL(file) : ""); };
  const canSave = step === "owner"
    ? Boolean(owner.firstName.trim() && owner.lastName.trim() && owner.email.trim() && owner.phone.replace(/\D/g, "").length >= 10 && owner.address.trim() && owner.city.trim() && owner.state.trim() && owner.zip.trim() && (!ownerPhotoRequired || photo || draft.owner.photoIdUrl))
    : step === "store-information"
      ? Boolean(store.name.trim() && store.email.trim() && store.phone.replace(/\D/g, "").length >= 10 && store.description.trim() && store.address.trim() && store.city.trim() && store.state.trim() && store.zip.trim() && (!logoRequired || logo || draft.logoUrl) && (!bannerRequired || banner || draft.bannerUrl))
      : step === "business-information"
    ? Boolean(business.businessType && business.registeredName.trim() && business.businessStructure && (!storeFrontRequired || storeFront || draft.storeFrontUrl) && (!storeInsideRequired || storeInside || draft.storeInsideUrl))
        : step === "schedule"
          ? !scheduleValidationError
          : false;
  /*
    Keep the button's disabled state explainable. Image fields are required
    too, but previously a missing image left the button disabled without any
    indication of why.
  */
  const missingRequirements =
    step === "owner"
      ? [
          !owner.firstName.trim() && "first name",
          !owner.lastName.trim() && "last name",
          !owner.email.trim() && "email",
          owner.phone.replace(/\D/g, "").length < 10 && "valid phone number",
          !owner.address.trim() && "home address",
          !owner.city.trim() && "city",
          !owner.state.trim() && "state",
          !owner.zip.trim() && "ZIP code",
          ownerPhotoRequired && !photo && !draft.owner.photoIdUrl && "photo ID",
        ]
      : step === "store-information"
        ? [
            !store.name.trim() && "store name",
            !store.email.trim() && "store email",
            store.phone.replace(/\D/g, "").length < 10 && "valid store phone number",
            !store.description.trim() && "store description",
            !store.address.trim() && "store address",
            !store.city.trim() && "city",
            !store.state.trim() && "state",
            !store.zip.trim() && "ZIP code",
            logoRequired && !logo && !draft.logoUrl && "store logo",
            bannerRequired && !banner && !draft.bannerUrl && "store banner",
          ]
        : step === "business-information"
          ? [
              !business.businessType && "business type",
              !business.registeredName.trim() && "registered business name",
              !business.businessStructure && "business structure",
              storeFrontRequired && !storeFront && !draft.storeFrontUrl && "store front photo",
              storeInsideRequired && !storeInside && !draft.storeInsideUrl && "inside store photo",
            ]
          : step === "schedule"
            ? [
                scheduleValidationError,
              ]
            : [];

  const missingLabels = missingRequirements.filter(
    (value): value is string => Boolean(value)
  );

  return <main className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-green-50 px-4 py-8"><section className="mx-auto max-w-2xl rounded-3xl bg-white p-6 shadow-xl sm:p-8"><div className="mb-8 flex items-center gap-3"><div className="relative h-12 w-12 overflow-hidden rounded-2xl bg-white shadow-sm"><Image src="/icon/icon-512.png" alt="LIA" fill sizes="48px" className="object-contain p-1" priority /></div><div><p className="text-xs font-semibold uppercase tracking-wide text-orange-600">LIA · Step {index + 1} of {ONBOARDING_STEPS.length}</p><h1 className="text-2xl font-bold text-gray-900">{stepMeta[step].title}</h1><p className="mt-1 text-sm text-gray-500">{stepMeta[step].subtitle}</p></div></div><div className="mb-8 flex gap-1">{ONBOARDING_STEPS.map((item, itemIndex) => <div key={item} className={`h-1.5 flex-1 rounded-full ${itemIndex <= index ? "bg-orange-500" : "bg-gray-100"}`} />)}</div>{error || message ? <p className="mb-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{message ?? error}</p> : null}
  {step === "owner" && <div className="grid gap-4 sm:grid-cols-2"><Input label="First name" required value={owner.firstName} onChange={(e) => setOwner({ ...owner, firstName: e.target.value })} /><Input label="Last name" required value={owner.lastName} onChange={(e) => setOwner({ ...owner, lastName: e.target.value })} /><Input label="Email" required type="email" value={owner.email} onChange={(e) => setOwner({ ...owner, email: e.target.value })} /><Input label="Phone number" required value={owner.phone} onChange={(e) => setOwner({ ...owner, phone: formatPhoneNumber(e.target.value) })} /><div className="sm:col-span-2"><Input label="Home address" required value={owner.address} onChange={(e) => setOwner({ ...owner, address: e.target.value })} /></div><Input label="City" required value={owner.city} onChange={(e) => setOwner({ ...owner, city: e.target.value })} /><StateSelect label="State" value={owner.state} onChange={(state) => setOwner({ ...owner, state })} /><Input label="ZIP code" required value={owner.zip} onChange={(e) => setOwner({ ...owner, zip: e.target.value })} /><ImageUpload label="Photo ID" required={ownerPhotoRequired} preview={photoPreview || draft.owner.photoIdUrl} contain onSelect={(file) => selectImage(file, setPhoto, setPhotoPreview)} /></div>}
  {step === "store-information" && <div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Input label="Store name" required value={store.name} onChange={(e) => setStore({ ...store, name: e.target.value })} /></div><Input label="Store email" required type="email" value={store.email} onChange={(e) => setStore({ ...store, email: e.target.value })} /><Input label="Store phone number" required value={store.phone} onChange={(e) => setStore({ ...store, phone: formatPhoneNumber(e.target.value) })} /><label className="sm:col-span-2 block text-sm font-medium text-gray-700">Store description *<textarea value={store.description} onChange={(e) => setStore({ ...store, description: e.target.value })} className="mt-1 min-h-24 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 outline-none focus:border-orange-500" /></label><div className="sm:col-span-2"><Input label="Store address" required value={store.address} onChange={(e) => setStore({ ...store, address: e.target.value })} /></div><Input label="City" required value={store.city} onChange={(e) => setStore({ ...store, city: e.target.value })} /><StateSelect label="State" value={store.state} onChange={(state) => setStore({ ...store, state })} /><Input label="ZIP code" required value={store.zip} onChange={(e) => setStore({ ...store, zip: e.target.value })} /><div className="sm:col-span-2 grid gap-4 sm:grid-cols-2"><ImageUpload label="Store logo" required={logoRequired} preview={logoPreview || draft.logoUrl} contain onSelect={(file) => selectImage(file, setLogo, setLogoPreview)} /><ImageUpload label={bannerRequired ? "Store banner" : "Banner (optional)"} required={bannerRequired} preview={bannerPreview || draft.bannerUrl} onSelect={(file) => selectImage(file, setBanner, setBannerPreview)} /></div></div>}
  {step === "business-information" && <div className="grid gap-4"><label className="text-sm font-medium text-gray-700">Business type *<select value={business.businessType} onChange={(e) => setBusiness({ ...business, businessType: e.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5"><option value="">Select business type</option><option value="grocery">Grocery store</option><option value="market">Market</option><option value="specialty_food">Specialty food</option></select></label><Input label="Registered business name" required value={business.registeredName} onChange={(e) => setBusiness({ ...business, registeredName: e.target.value })} /><Input label="EIN (optional)" inputMode="numeric" maxLength={10} placeholder="00-0000000" value={business.ein} onChange={(e) => setBusiness({ ...business, ein: formatEin(e.target.value) })} /><label className="text-sm font-medium text-gray-700">Business structure *<select value={business.businessStructure} onChange={(e) => setBusiness({ ...business, businessStructure: e.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5"><option value="">Select structure</option><option value="sole_proprietorship">Sole proprietorship</option><option value="dba">DBA</option><option value="llc">LLC</option><option value="partnership">Partnership</option><option value="corporation">Corporation</option></select></label><div className="grid gap-4 sm:grid-cols-2"><ImageUpload label="Store front photo" required={storeFrontRequired} preview={storeFrontPreview || draft.storeFrontUrl} onSelect={(file) => selectImage(file, setStoreFront, setStoreFrontPreview)} /><ImageUpload label="Inside store photo" required={storeInsideRequired} preview={storeInsidePreview || draft.storeInsideUrl} onSelect={(file) => selectImage(file, setStoreInside, setStoreInsidePreview)} /></div></div>}
  {step === "schedule" && <div className="space-y-3">{schedule.map((day, dayIndex) => <div key={day.day} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-xl border border-gray-100 p-3"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!day.isClosed} onChange={(e) => setSchedule(schedule.map((item, i) => i === dayIndex ? { ...item, isClosed: !e.target.checked } : item))} />{day.day}</label><input type="time" disabled={day.isClosed} value={day.open} onChange={(e) => { setSchedule(schedule.map((item, i) => i === dayIndex ? { ...item, open: e.target.value } : item)); e.currentTarget.blur(); }} className="rounded-lg border p-2 text-sm disabled:bg-gray-100" /><input type="time" disabled={day.isClosed} value={day.close} onChange={(e) => { setSchedule(schedule.map((item, i) => i === dayIndex ? { ...item, close: e.target.value } : item)); e.currentTarget.blur(); }} className="rounded-lg border p-2 text-sm disabled:bg-gray-100" /></div>)}</div>}
  {step === "stripe" && <div className="space-y-5"><div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">LIA never sees your bank account details. Stripe securely collects identity, tax, and payout information. Stripe may review your submission after you return; its status stays synchronized automatically.</div>{stripeRequired && <div className="rounded-xl bg-gray-50 p-4"><p className="font-semibold text-gray-800">Stripe status: <span className="capitalize">{(stripeStatus ?? "not_started").replaceAll("_", " ")}</span></p><p className="mt-1 text-sm text-gray-500">{returnedFromStripe || canFinishStripe ? "Your Stripe submission has been received. Finish onboarding to send your store to LIA for approval." : "Complete the Stripe-hosted form to continue."}</p></div>}{canFinishStripe ? <button onClick={async () => { setSaving(true); try { await storeOnboardingService.complete(user.uid); router.replace("/store/pending-approval"); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Unable to finish onboarding."); } finally { setSaving(false); } }} disabled={saving} className="w-full rounded-xl bg-green-600 py-3 font-semibold text-white disabled:opacity-50"><CheckCircle2 className="mr-2 inline h-5 w-5" />Finish onboarding</button> : <button onClick={connectStripe} disabled={connecting} className="w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white disabled:opacity-50">{connecting ? "Opening Stripe..." : stripeStatus && stripeStatus !== "not_started" ? "Continue Stripe setup" : "Connect Stripe"}</button>}</div>}
  {step !== "stripe" && <div className="mt-8"><p aria-live="polite" className={`mb-3 text-right text-xs ${canSave ? "text-green-700" : "text-amber-700"}`}>{canSave ? "All required fields are complete." : `Still needed: ${missingLabels.join(", ")}.`}</p><div className="flex gap-3">{back ? <button onClick={() => navigate(back)} className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700"><ArrowLeft className="mr-1 inline h-4 w-4" />Back</button> : null}<button onClick={save} disabled={saving || !canSave} className="ml-auto rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : <>Save and continue <ArrowRight className="ml-1 inline h-4 w-4" /></>}</button></div></div>}</section></main>;
}

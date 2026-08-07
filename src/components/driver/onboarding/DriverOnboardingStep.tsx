"use client";

/*
|--------------------------------------------------------------------------
| Driver Onboarding Step
|--------------------------------------------------------------------------
|
| A single reusable screen for every driver-application step. It owns only
| form state and navigation; the driver onboarding and Stripe services own
| all Firebase and API work.
|
*/

import {
  useEffect,
  useState,
} from "react";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Upload,
} from "lucide-react";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import ProtectedRoute from "@/components/auth/ProtectedRoute";
import {
  RoleGuard,
} from "@/components/auth/RoleGuard";
import {
  BrandedLoader,
} from "@/components/ui/BrandedLoader";
import {
  useDriverOnboarding,
} from "@/hooks/useDriverOnboarding";
import {
  driverOnboardingService,
} from "@/services/driver/driverOnboardingService";
import {
  driverStripeConnectClientService,
  isDriverStripeConnectClientError,
} from "@/services/payment/driverStripeConnectClientService";
import {
  formatPhoneNumber,
} from "@/utils/phone";
import {
  DRIVER_ONBOARDING_STEPS,
  type DeliveryMethod,
  type DriverOnboardingStep as DriverOnboardingStepName,
} from "@/types/driverOnboarding";

const stepMeta: Record<DriverOnboardingStepName, { title: string; subtitle: string }> = {
  "personal-information": {
    title: "Personal information",
    subtitle: "Tell us about the person applying to deliver with LIA.",
  },
  "address-service-area": {
    title: "Address and service area",
    subtitle: "Confirm your home address and where you prefer to deliver.",
  },
  "vehicle-information": {
    title: "Vehicle information",
    subtitle: "Add the vehicle you will use for deliveries.",
  },
  documents: {
    title: "Driver documents",
    subtitle: "Upload current documents for LIA's approval review.",
  },
  agreement: {
    title: "Review and agreements",
    subtitle: "Review how driver earnings work, then submit your agreements.",
  },
  stripe: {
    title: "Set up payouts",
    subtitle: "Stripe securely collects your identity and payout information.",
  },
};

function Input({
  label,
  required,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-gray-700">
      {label}{required ? " *" : ""}
      <input
        {...props}
        className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
      />
    </label>
  );
}

/*
  The upload picker keeps the original product/store experience: one image
  surface opens a choice to take a photo or upload an existing file.
*/
function DocumentUpload({
  label,
  required,
  preview,
  onSelect,
}: {
  label: string;
  required?: boolean;
  preview?: string;
  onSelect: (file: File | null) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const choose = (file: File | null) => {
    onSelect(file);
    setPickerOpen(false);
  };

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-gray-700">
        {label}{required ? " *" : ""}
      </p>
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="relative flex aspect-[4/3] w-full flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 text-center transition hover:border-orange-500"
      >
        {preview ? (
          <img src={preview} alt={`${label} preview`} className="h-full w-full object-contain p-2" />
        ) : (
          <>
            <Upload className="mb-2 h-7 w-7 text-gray-400" />
            <span className="text-xs font-medium text-gray-600">Tap to add {label.toLowerCase()}</span>
            <span className="mt-1 text-[10px] text-gray-400">Take a photo or upload one</span>
          </>
        )}
      </button>
      {pickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-4 sm:items-center sm:justify-center">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900">Add {label}</h3>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <label className="flex cursor-pointer flex-col items-center rounded-2xl border border-gray-200 p-4 hover:bg-orange-50">
                <Camera className="mb-2 h-7 w-7 text-orange-600" />
                <span className="text-sm font-semibold">Take photo</span>
                <input hidden type="file" accept="image/*" capture="environment" onChange={(event) => choose(event.target.files?.[0] ?? null)} />
              </label>
              <label className="flex cursor-pointer flex-col items-center rounded-2xl border border-gray-200 p-4 hover:bg-orange-50">
                <Upload className="mb-2 h-7 w-7 text-orange-600" />
                <span className="text-sm font-semibold">Upload image</span>
                <input hidden type="file" accept="image/*" onChange={(event) => choose(event.target.files?.[0] ?? null)} />
              </label>
            </div>
            <button type="button" onClick={() => setPickerOpen(false)} className="mt-4 w-full rounded-xl py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AgreementRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4 text-sm text-gray-700 hover:bg-gray-50">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 accent-orange-600" />
      <span>{children}</span>
    </label>
  );
}

export function DriverOnboardingStep({
  step,
}: {
  step: DriverOnboardingStepName;
}) {
  return (
    <RoleGuard allowedAccountTypes={["driver"]}>
      <ProtectedRoute>
        <DriverOnboardingStepContent step={step} />
      </ProtectedRoute>
    </RoleGuard>
  );
}

function DriverOnboardingStepContent({
  step,
}: {
  step: DriverOnboardingStepName;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, draft, loading, error } = useDriverOnboarding();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [personal, setPersonal] = useState({ firstName: "", middleName: "", lastName: "", phone: "", email: "", dateOfBirth: "" });
  const [address, setAddress] = useState({ street: "", apartment: "", city: "", state: "", zip: "" });
  const [serviceArea, setServiceArea] = useState({ city: "", state: "", preferredRadiusMiles: "" });
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod | "">("");
  const [vehicle, setVehicle] = useState({ make: "", model: "", year: "", color: "", licensePlate: "", registrationState: "" });
  const [documents, setDocuments] = useState({ issuingState: "", licenseExpirationDate: "", insuranceProvider: "", insuranceExpirationDate: "", registrationExpirationDate: "" });
  const [agreements, setAgreements] = useState({ acceptedTerms: false, acceptedPrivacyPolicy: false, acceptedDriverAgreement: false, informationCertifiedAccurate: false });
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [stripeStatus, setStripeStatus] = useState(draft?.stripeAccountStatus);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (!draft) return;

    setPersonal({ firstName: draft.firstName, middleName: draft.middleName, lastName: draft.lastName, phone: draft.phone, email: draft.email, dateOfBirth: draft.dateOfBirth });
    setAddress({ street: draft.address.street, apartment: draft.address.apartment, city: draft.address.city, state: draft.address.state, zip: draft.address.zip });
    setServiceArea({ city: draft.serviceArea.city, state: draft.serviceArea.state, preferredRadiusMiles: draft.serviceArea.preferredRadiusMiles?.toString() ?? "" });
    setDeliveryMethod(draft.deliveryMethod);
    setVehicle({ make: draft.vehicle.make, model: draft.vehicle.model, year: draft.vehicle.year?.toString() ?? "", color: draft.vehicle.color, licensePlate: draft.vehicle.licensePlate, registrationState: draft.vehicle.registrationState });
    setDocuments({ issuingState: draft.driversLicense.issuingState, licenseExpirationDate: draft.driversLicense.expirationDate, insuranceProvider: draft.vehicleInsurance.provider, insuranceExpirationDate: draft.vehicleInsurance.expirationDate, registrationExpirationDate: draft.vehicleRegistration.expirationDate });
    setAgreements({ acceptedTerms: draft.agreements.terms.accepted, acceptedPrivacyPolicy: draft.agreements.privacyPolicy.accepted, acceptedDriverAgreement: draft.agreements.driverAgreement.accepted, informationCertifiedAccurate: draft.agreements.informationCertifiedAccurate });
    setStripeStatus(draft.stripeAccountStatus);
  }, [draft]);

  useEffect(() => {
    if (step !== "stripe" || searchParams.get("stripe") !== "return") return;

    void driverStripeConnectClientService.getAccountStatus()
      .then((result) => setStripeStatus(result.account?.onboardingStatus))
      .catch(() => setMessage("We couldn't refresh Stripe yet. Please try again."));
  }, [searchParams, step]);

  if (loading) return <BrandedLoader message="Loading driver onboarding" />;
  if (!user || !draft) return null;

  const policy = draft.applicationPolicy;
  const maximumPreferredRadiusMiles = policy?.maximumPreferredRadiusMiles ?? 50;
  const licenseFrontRequired = policy?.requiredDocuments.driversLicenseFront ?? true;
  const licenseBackRequired = policy?.requiredDocuments.driversLicenseBack ?? true;
  const insuranceRequired = policy?.requiredDocuments.vehicleInsurance ?? true;
  const registrationRequired = policy?.requiredDocuments.vehicleRegistration ?? true;
  const stripeRequired = policy?.requireStripeAccount ?? true;

  const index = DRIVER_ONBOARDING_STEPS.indexOf(step);
  const next = DRIVER_ONBOARDING_STEPS[index + 1];
  const back = DRIVER_ONBOARDING_STEPS[index - 1];
  const navigate = (destination: DriverOnboardingStepName) => router.push(driverOnboardingService.pathFor(destination));
  const setFile = (key: string, file: File | null) => {
    setFiles((current) => ({ ...current, [key]: file }));
    setPreviews((current) => ({ ...current, [key]: file ? URL.createObjectURL(file) : "" }));
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      if (step === "personal-information") {
        await driverOnboardingService.savePersonalInformation(user.uid, { ...personal, profilePhoto: files["profile-photo"] ?? null });
      }
      if (step === "address-service-area") {
        await driverOnboardingService.saveAddressAndServiceArea(user.uid, { address, serviceArea: { city: serviceArea.city, state: serviceArea.state, preferredRadiusMiles: Number(serviceArea.preferredRadiusMiles) || null } });
      }
      if (step === "vehicle-information") {
        await driverOnboardingService.saveVehicleInformation(user.uid, deliveryMethod as DeliveryMethod, { ...vehicle, year: Number(vehicle.year) || null });
      }
      if (step === "documents") {
        await driverOnboardingService.saveDocuments(user.uid, { ...documents, files: {
          "drivers-license-front": files["drivers-license-front"] ?? null,
          "drivers-license-back": files["drivers-license-back"] ?? null,
          "vehicle-insurance": files["vehicle-insurance"] ?? null,
          "vehicle-registration": files["vehicle-registration"] ?? null,
        } });
      }
      if (step === "agreement") await driverOnboardingService.saveAgreement(user.uid, agreements);
      if (next) navigate(next);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to save this step.");
      setSaving(false);
    }
  };

  const connectStripe = async () => {
    setConnecting(true);
    setMessage(null);
    try {
      await driverStripeConnectClientService.createOrRetrieveAccount();
      const result = await driverStripeConnectClientService.createOnboardingLink();
      window.location.assign(result.onboarding.url);
    } catch (cause) {
      setMessage(isDriverStripeConnectClientError(cause) ? cause.message : "Stripe onboarding could not be started.");
      setConnecting(false);
    }
  };

  const canFinishStripe = !stripeRequired || stripeStatus === "complete" || stripeStatus === "pending_verification";
  const returnedFromStripe = searchParams.get("stripe") === "return";
  const canSubmitApplication = !stripeRequired || returnedFromStripe || canFinishStripe;
  const canSave = step === "personal-information"
    ? Boolean(personal.firstName.trim() && personal.lastName.trim() && personal.phone.replace(/\D/g, "").length >= 10 && personal.email.trim() && personal.dateOfBirth)
    : step === "address-service-area"
      ? Boolean(address.street.trim() && address.city.trim() && address.state.trim() && address.zip.trim() && serviceArea.city.trim() && serviceArea.state.trim() && Number(serviceArea.preferredRadiusMiles) > 0 && Number(serviceArea.preferredRadiusMiles) <= maximumPreferredRadiusMiles)
      : step === "vehicle-information"
        ? Boolean(deliveryMethod && vehicle.make.trim() && vehicle.model.trim() && Number(vehicle.year) && vehicle.color.trim() && vehicle.licensePlate.trim() && vehicle.registrationState.trim())
        : step === "documents"
          ? Boolean((!licenseFrontRequired && !licenseBackRequired || (documents.issuingState.trim() && documents.licenseExpirationDate)) && (!licenseFrontRequired || files["drivers-license-front"] || draft.driversLicense.frontDocumentUrl) && (!licenseBackRequired || files["drivers-license-back"] || draft.driversLicense.backDocumentUrl) && (!insuranceRequired || (documents.insuranceExpirationDate && (files["vehicle-insurance"] || draft.vehicleInsurance.documentUrl))) && (!registrationRequired || (documents.registrationExpirationDate && (files["vehicle-registration"] || draft.vehicleRegistration.documentUrl))) )
          : step === "agreement"
            ? Object.values(agreements).every(Boolean)
            : false;

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-green-50 px-4 py-8">
      <section className="mx-auto max-w-2xl rounded-3xl bg-white p-6 shadow-xl sm:p-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="relative h-12 w-12 overflow-hidden rounded-2xl bg-white shadow-sm"><Image src="/icon/icon-512.png" alt="LIA" fill sizes="48px" className="object-contain p-1" priority /></div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-orange-600">LIA Driver · Step {index + 1} of {DRIVER_ONBOARDING_STEPS.length}</p><h1 className="text-2xl font-bold text-gray-900">{stepMeta[step].title}</h1><p className="mt-1 text-sm text-gray-500">{stepMeta[step].subtitle}</p></div>
        </div>
        <div className="mb-8 flex gap-1">{DRIVER_ONBOARDING_STEPS.map((item, itemIndex) => <div key={item} className={`h-1.5 flex-1 rounded-full ${itemIndex <= index ? "bg-orange-500" : "bg-gray-100"}`} />)}</div>
        {error || message ? <p className="mb-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{message ?? error}</p> : null}

        {step === "personal-information" ? <div className="grid gap-4 sm:grid-cols-2"><Input label="First name" required value={personal.firstName} onChange={(event) => setPersonal({ ...personal, firstName: event.target.value })} /><Input label="Middle name" value={personal.middleName} onChange={(event) => setPersonal({ ...personal, middleName: event.target.value })} /><Input label="Last name" required value={personal.lastName} onChange={(event) => setPersonal({ ...personal, lastName: event.target.value })} /><Input label="Date of birth" required type="date" value={personal.dateOfBirth} onChange={(event) => setPersonal({ ...personal, dateOfBirth: event.target.value })} /><Input label="Email" required type="email" value={personal.email} onChange={(event) => setPersonal({ ...personal, email: event.target.value })} /><Input label="Phone number" required value={personal.phone} onChange={(event) => setPersonal({ ...personal, phone: formatPhoneNumber(event.target.value) })} /><div className="sm:col-span-2"><DocumentUpload label="Profile photo (optional)" preview={previews["profile-photo"] || draft.profilePhotoUrl} onSelect={(file) => setFile("profile-photo", file)} /></div></div> : null}

        {step === "address-service-area" ? <div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Input label="Home address" required value={address.street} onChange={(event) => setAddress({ ...address, street: event.target.value })} /></div><Input label="Apartment, suite, etc. (optional)" value={address.apartment} onChange={(event) => setAddress({ ...address, apartment: event.target.value })} /><div className="hidden sm:block" /><Input label="City" required value={address.city} onChange={(event) => setAddress({ ...address, city: event.target.value })} /><Input label="State" required value={address.state} onChange={(event) => setAddress({ ...address, state: event.target.value })} /><Input label="ZIP code" required value={address.zip} onChange={(event) => setAddress({ ...address, zip: event.target.value })} /><div className="sm:col-span-2 mt-2 rounded-2xl bg-blue-50 p-4"><p className="font-semibold text-blue-900">Area you prefer to serve</p><div className="mt-3 grid gap-4 sm:grid-cols-3"><Input label="Service city" required value={serviceArea.city} onChange={(event) => setServiceArea({ ...serviceArea, city: event.target.value })} /><Input label="Service state" required value={serviceArea.state} onChange={(event) => setServiceArea({ ...serviceArea, state: event.target.value })} /><Input label="Requested radius (miles)" required type="number" min="1" max={maximumPreferredRadiusMiles} value={serviceArea.preferredRadiusMiles} onChange={(event) => setServiceArea({ ...serviceArea, preferredRadiusMiles: event.target.value })} /></div><p className="mt-3 text-sm text-blue-800">Drivers may request up to {maximumPreferredRadiusMiles} miles. An administrator approves the final operating radius.</p></div></div> : null}

        {step === "vehicle-information" ? <div className="grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2 text-sm font-medium text-gray-700">Delivery method *<select value={deliveryMethod} onChange={(event) => setDeliveryMethod(event.target.value as DeliveryMethod)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5"><option value="">Select a delivery method</option><option value="car">Car</option><option value="motorcycle">Motorcycle</option><option value="scooter">Scooter</option></select></label><Input label="Vehicle make" required value={vehicle.make} onChange={(event) => setVehicle({ ...vehicle, make: event.target.value })} /><Input label="Vehicle model" required value={vehicle.model} onChange={(event) => setVehicle({ ...vehicle, model: event.target.value })} /><Input label="Year" required type="number" min="1900" max={(new Date().getFullYear() + 1).toString()} value={vehicle.year} onChange={(event) => setVehicle({ ...vehicle, year: event.target.value })} /><Input label="Color" required value={vehicle.color} onChange={(event) => setVehicle({ ...vehicle, color: event.target.value })} /><Input label="License plate" required value={vehicle.licensePlate} onChange={(event) => setVehicle({ ...vehicle, licensePlate: event.target.value })} /><Input label="Registration state" required value={vehicle.registrationState} onChange={(event) => setVehicle({ ...vehicle, registrationState: event.target.value })} /></div> : null}

        {step === "documents" ? <div className="space-y-6"><div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"><FileText className="mr-2 inline h-4 w-4" />Use current, readable documents. Your documents are used only for LIA's private approval review.</div><div className="grid gap-4 sm:grid-cols-2"><Input label="Driver license issuing state" required={licenseFrontRequired || licenseBackRequired} value={documents.issuingState} onChange={(event) => setDocuments({ ...documents, issuingState: event.target.value })} /><Input label="License expiration date" required={licenseFrontRequired || licenseBackRequired} type="date" value={documents.licenseExpirationDate} onChange={(event) => setDocuments({ ...documents, licenseExpirationDate: event.target.value })} /><DocumentUpload label="Driver license front" required={licenseFrontRequired} preview={previews["drivers-license-front"] || draft.driversLicense.frontDocumentUrl} onSelect={(file) => setFile("drivers-license-front", file)} /><DocumentUpload label="Driver license back" required={licenseBackRequired} preview={previews["drivers-license-back"] || draft.driversLicense.backDocumentUrl} onSelect={(file) => setFile("drivers-license-back", file)} /></div><div className="grid gap-4 border-t border-gray-100 pt-6 sm:grid-cols-2"><Input label="Insurance provider (optional)" value={documents.insuranceProvider} onChange={(event) => setDocuments({ ...documents, insuranceProvider: event.target.value })} /><Input label="Insurance expiration date" required={insuranceRequired} type="date" value={documents.insuranceExpirationDate} onChange={(event) => setDocuments({ ...documents, insuranceExpirationDate: event.target.value })} /><DocumentUpload label="Vehicle insurance" required={insuranceRequired} preview={previews["vehicle-insurance"] || draft.vehicleInsurance.documentUrl} onSelect={(file) => setFile("vehicle-insurance", file)} /><div className="hidden sm:block" /></div><div className="grid gap-4 border-t border-gray-100 pt-6 sm:grid-cols-2"><Input label="Registration expiration date" required={registrationRequired} type="date" value={documents.registrationExpirationDate} onChange={(event) => setDocuments({ ...documents, registrationExpirationDate: event.target.value })} /><DocumentUpload label="Vehicle registration" required={registrationRequired} preview={previews["vehicle-registration"] || draft.vehicleRegistration.documentUrl} onSelect={(file) => setFile("vehicle-registration", file)} /></div></div> : null}

        {step === "agreement" ? <div className="space-y-4"><div className="rounded-2xl border border-green-200 bg-green-50 p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-6 w-6 text-green-700" /><div><h2 className="font-bold text-green-950">Driver earnings</h2><p className="mt-2 text-sm text-green-900">For every completed delivery, LIA pays you <strong>70% of the delivery fee</strong>. LIA retains 30% to operate the platform. You receive <strong>100% of every customer tip</strong>.</p></div></div></div><AgreementRow checked={agreements.acceptedTerms} onChange={(value) => setAgreements({ ...agreements, acceptedTerms: value })}>I accept the LIA Terms of Service.</AgreementRow><AgreementRow checked={agreements.acceptedPrivacyPolicy} onChange={(value) => setAgreements({ ...agreements, acceptedPrivacyPolicy: value })}>I accept the LIA Privacy Policy.</AgreementRow><AgreementRow checked={agreements.acceptedDriverAgreement} onChange={(value) => setAgreements({ ...agreements, acceptedDriverAgreement: value })}>I accept the Driver Agreement, including the 70% delivery-fee and 100% tip payout terms.</AgreementRow><AgreementRow checked={agreements.informationCertifiedAccurate} onChange={(value) => setAgreements({ ...agreements, informationCertifiedAccurate: value })}>I certify that the information and documents in this application are accurate and current.</AgreementRow></div> : null}

        {step === "stripe" ? <div className="space-y-5"><div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">Stripe securely collects identity, tax, and bank information for payouts. LIA never receives your bank account details. After you submit Stripe's form, it may take time for Stripe to verify your information.</div>{stripeRequired && <div className="rounded-xl bg-gray-50 p-4"><p className="font-semibold text-gray-800">Stripe status: <span className="capitalize">{(stripeStatus ?? "not_started").replaceAll("_", " ")}</span></p><p className="mt-1 text-sm text-gray-500">{canSubmitApplication ? "Your Stripe submission has been received. Submit your driver application for LIA approval." : "Complete Stripe's hosted payout form to continue."}</p></div>}{canSubmitApplication ? <button type="button" onClick={async () => { setSaving(true); try { await driverOnboardingService.complete(user.uid); router.replace("/driver/pending-approval"); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Unable to submit your application."); } finally { setSaving(false); } }} disabled={saving} className="w-full rounded-xl bg-green-600 py-3 font-semibold text-white disabled:opacity-50"><CheckCircle2 className="mr-2 inline h-5 w-5" />Submit application for approval</button> : <button type="button" onClick={connectStripe} disabled={connecting} className="w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white disabled:opacity-50">{connecting ? "Opening Stripe..." : stripeStatus && stripeStatus !== "not_started" ? "Continue Stripe setup" : "Connect Stripe"}</button>}</div> : null}

        {step !== "stripe" ? <div className="mt-8 flex gap-3">{back ? <button type="button" onClick={() => navigate(back)} className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700"><ArrowLeft className="mr-1 inline h-4 w-4" />Back</button> : null}<button type="button" onClick={save} disabled={saving || !canSave} className="ml-auto rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : <>Save and continue <ArrowRight className="ml-1 inline h-4 w-4" /></>}</button></div> : null}
      </section>
    </main>
  );
}

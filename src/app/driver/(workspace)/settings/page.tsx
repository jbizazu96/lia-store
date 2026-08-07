"use client";

/*
|--------------------------------------------------------------------------
| Driver Settings
|--------------------------------------------------------------------------
|
| The page only calls authenticated client services and Firebase Auth for a
| password change. Protected driver records are updated by server routes
| after ownership checks.
|
*/

import { useEffect, useRef, useState } from "react";
import { AlertCircle, BadgeDollarSign, Camera, FileUp, HelpCircle, Mail, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/lib/firebase";
import { PageContentSkeleton } from "@/components/ui/PageContentSkeleton";
import { DriverDocumentReplaceModal } from "@/components/driver/DriverDocumentReplaceModal";
import { DriverHelpCenterModal } from "@/components/driver/DriverHelpCenterModal";
import { DriverPasswordSection } from "@/components/driver/DriverPasswordSection";
import { DriverProfileEditModal } from "@/components/driver/DriverProfileEditModal";
import { driverImageService, type DriverImageField } from "@/services/driver/driverImageService";
import { driverStripeConnectClientService } from "@/services/payment/driverStripeConnectClientService";
import { driverWorkspaceClientService } from "@/services/driver/driverWorkspaceClientService";
import type { DriverWorkspaceSummary } from "@/types/driverWorkspace";

type ReviewableField = Exclude<DriverImageField, "profile-photo">;
const replacements: { label: string; field: ReviewableField }[] = [
  { label: "Driver license — front", field: "drivers-license-front" },
  { label: "Driver license — back", field: "drivers-license-back" },
  { label: "Vehicle insurance", field: "vehicle-insurance" },
  { label: "Vehicle registration", field: "vehicle-registration" },
];

function stripeLabel(summary: DriverWorkspaceSummary) {
  if (!summary.stripe.status || summary.stripe.status === "not_started") return "Not connected";
  if (summary.stripe.requiresAction || !summary.stripe.payoutsEnabled) return "Needs attention";
  return "Connected";
}

function addressLabel(summary: DriverWorkspaceSummary) {
  const value = summary.profile.address;
  return value.formattedAddress || [value.street, value.apartment, value.city, value.state, value.zip].filter(Boolean).join(", ");
}

export default function DriverSettingsPage() {
  const [summary, setSummary] = useState<DriverWorkspaceSummary | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [helpCenterOpen, setHelpCenterOpen] = useState(false);
  const [documentModal, setDocumentModal] = useState<{ label: string; field: ReviewableField; expirationDate?: string } | null>(null);
  const profileImageInput = useRef<HTMLInputElement>(null);
  const refresh = () => driverWorkspaceClientService.getSummary().then(setSummary).catch(() => setSummary(null));
  useEffect(() => { void refresh(); }, []);
  if (!summary) return <PageContentSkeleton cards={2} rows={5} />;

  const uploadProfilePhoto = async (file: File) => {
    const user = auth.currentUser;
    if (!user) return;
    try { setBusy(true); setMessage(""); await driverImageService.uploadOriginalImage({ driverId: user.uid, field: "profile-photo", file }); setMessage("Profile photo uploaded and is being processed."); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to upload the profile photo."); } finally { setBusy(false); if (profileImageInput.current) profileImageInput.current.value = ""; }
  };
  const saveProfile = async (profile: DriverWorkspaceSummary["profile"]) => {
    try { setBusy(true); setMessage(""); const updated = await driverWorkspaceClientService.updateProfile(profile); setSummary(updated); setProfileOpen(false); setMessage("Driver profile updated."); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to update profile."); } finally { setBusy(false); }
  };
  const submitDocument = async (values: { file: File; expirationDate: string; issuingState?: string; provider?: string }) => {
    const choice = documentModal; const user = auth.currentUser;
    if (!choice || !user) return;
    try { setBusy(true); setMessage(""); await driverImageService.uploadOriginalImage({ driverId: user.uid, field: choice.field, file: values.file }); await driverWorkspaceClientService.submitDocumentReplacement({ field: choice.field, expirationDate: values.expirationDate, issuingState: values.issuingState, provider: values.provider }); await refresh(); setDocumentModal(null); setMessage("Replacement submitted for administrator review."); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to submit the replacement."); } finally { setBusy(false); }
  };
  const connectStripe = async () => { try { setBusy(true); await driverStripeConnectClientService.createOrRetrieveAccount(); const onboarding = await driverStripeConnectClientService.createOnboardingLink(); window.location.assign(onboarding.onboarding.url); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to start Stripe onboarding."); } finally { setBusy(false); } };
  const requestDeletion = async () => { if (!window.confirm("Request account deletion? An administrator must approve it before any deletion begins.")) return; try { setBusy(true); await httpsCallable(functions, "requestAccountDeletion")({ ownerType: "driver", reasonCode: "no_longer_needed", reasonDetails: null }); setMessage("Your deletion request was sent for admin review."); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to request deletion."); } finally { setBusy(false); } };
  const documentDetails = new Map(summary.documents.map((document) => [document.label, document]));
  const radius = summary.profile.serviceArea.approvedRadiusMiles ?? summary.profile.serviceArea.preferredRadiusMiles;

  return <section className="mx-auto max-w-3xl"><p className="text-sm font-semibold text-orange-600">DRIVER SETTINGS</p><h1 className="mt-1 text-3xl font-bold">Settings</h1>{message && <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-800">{message}</p>}<input ref={profileImageInput} className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadProfilePhoto(file); }} />
    <div className="mt-6 space-y-5"><article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="rounded-full bg-orange-50 p-3"><UserRound className="h-5 w-5 text-orange-600" /></div><div><p className="font-bold">Profile</p><p className="text-sm text-slate-500">Personal, address, service area, and vehicle information</p></div></div><button disabled={busy} onClick={() => setProfileOpen(true)} className="text-sm font-bold text-orange-600">Edit</button></div><div className="mt-4 grid gap-2 text-sm text-slate-600"><p><span className="font-semibold text-slate-800">Name:</span> {[summary.profile.firstName, summary.profile.middleName, summary.profile.lastName].filter(Boolean).join(" ")}</p><p><span className="font-semibold text-slate-800">Email:</span> {summary.profile.email}</p><p><span className="font-semibold text-slate-800">Phone:</span> {summary.profile.phone}</p><p><span className="font-semibold text-slate-800">Date of birth:</span> {summary.profile.dateOfBirth || "Not provided"}</p><p><span className="font-semibold text-slate-800">Home address:</span> {addressLabel(summary) || "Not provided"}</p><p><span className="font-semibold text-slate-800">Service area:</span> {[summary.profile.serviceArea.city, summary.profile.serviceArea.state].filter(Boolean).join(", ") || "Not provided"}</p><p><span className="font-semibold text-slate-800">Vehicle:</span> {[summary.profile.vehicle.year, summary.profile.vehicle.make, summary.profile.vehicle.model, summary.profile.vehicle.color].filter(Boolean).join(" ") || "Not provided"}</p></div><button disabled={busy} onClick={() => profileImageInput.current?.click()} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold"><Camera className="h-4 w-4" />Replace profile photo</button></article>
    <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><div className="flex items-center gap-3"><div className="rounded-full bg-orange-50 p-3"><FileUp className="h-5 w-5 text-orange-600" /></div><div><p className="font-bold">Documents</p><p className="text-sm text-slate-500">Replacement uploads return to administrator review.</p></div></div><div className="mt-4 divide-y divide-slate-100">{replacements.map((item) => { const detail = documentDetails.get(item.label.startsWith("Driver license") ? "Driver license" : item.label); const expiration = detail?.expirationDate ? " · Expires " + new Date(detail.expirationDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : " · Expiration date not provided"; return <div key={item.field} className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold">{item.label}</p><p className="mt-1 text-xs capitalize text-slate-500">{detail?.reviewStatus ?? "missing"}{expiration}</p></div><button disabled={busy} onClick={() => setDocumentModal({ ...item, expirationDate: detail?.expirationDate })} className="shrink-0 rounded-lg border border-orange-200 px-3 py-2 text-xs font-bold text-orange-700 hover:bg-orange-50 disabled:opacity-50">Replace</button></div>; })}</div></article>
    <article className="rounded-2xl bg-green-50 p-5 ring-1 ring-green-100"><p className="font-bold text-green-950">Delivery radius and payment policy</p><p className="mt-2 text-sm text-green-900">Your current {summary.profile.serviceArea.approvedRadiusMiles ? "approved" : "requested"} service radius is <strong>{radius ?? "not set"} miles</strong>. Final assignments are based on administrator approval and available delivery areas.</p><p className="mt-3 text-sm text-green-900">For each completed delivery, you receive <strong>70% of the delivery fee</strong> and <strong>100% of customer tips</strong>. LIA retains 30% of the delivery fee to operate the platform.</p></article>
    <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><div className="flex items-center gap-3"><div className="rounded-full bg-orange-50 p-3"><BadgeDollarSign className="h-5 w-5 text-orange-600" /></div><div><p className="font-bold">Payout account</p><p className="text-sm text-slate-500">{stripeLabel(summary)}</p></div></div><div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} onClick={() => void connectStripe()} className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{summary.stripe.status === "not_started" ? "Connect Stripe" : "Update Stripe"}</button><button disabled={busy} onClick={() => void driverStripeConnectClientService.getAccountStatus().then(() => refresh()).catch((error) => setMessage(error.message))} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">View payout status</button></div></article>
    <DriverPasswordSection onMessage={setMessage} />
    <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><p className="font-bold">Support</p><div className="mt-3 grid gap-2"><button type="button" onClick={() => setHelpCenterOpen(true)} className="flex items-center justify-between rounded-xl px-2 py-2 text-left text-sm font-medium hover:bg-slate-50">Help Center <HelpCircle className="h-4 w-4" /></button><a href="mailto:support@liamarketplace.com" className="flex items-center justify-between rounded-xl px-2 py-2 text-sm font-medium hover:bg-slate-50">Contact Support <Mail className="h-4 w-4" /></a><a href="mailto:support@liamarketplace.com?subject=Driver%20issue" className="flex items-center justify-between rounded-xl px-2 py-2 text-sm font-medium hover:bg-slate-50">Report an issue <AlertCircle className="h-4 w-4" /></a></div></article>
    <article className="rounded-2xl border border-red-100 bg-red-50 p-5"><div className="flex gap-3"><ShieldCheck className="h-5 w-5 text-red-600" /><div><p className="font-bold text-red-900">Delete account</p><p className="mt-1 text-sm text-red-700">Your request is reviewed by LIA before any account deletion starts.</p><button disabled={busy} onClick={() => void requestDeletion()} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white"><Trash2 className="h-4 w-4" />Request deletion</button></div></div></article></div>
    {profileOpen && <DriverProfileEditModal profile={summary.profile} saving={busy} onClose={() => setProfileOpen(false)} onSave={(profile) => void saveProfile(profile)} />}
    {documentModal && <DriverDocumentReplaceModal label={documentModal.label} field={documentModal.field} currentExpirationDate={documentModal.expirationDate} saving={busy} onClose={() => setDocumentModal(null)} onSubmit={(values) => void submitDocument(values)} />}
    {helpCenterOpen && <DriverHelpCenterModal onClose={() => setHelpCenterOpen(false)} />}
  </section>;
}

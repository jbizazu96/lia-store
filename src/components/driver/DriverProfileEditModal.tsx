"use client";

/*
|--------------------------------------------------------------------------
| Driver Profile Edit Modal
|--------------------------------------------------------------------------
|
| This component only collects the driver's changes. The authenticated
| driver API validates ownership, verifies the address by geocoding it,
| normalizes state codes, and persists the approved fields.
|
*/

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { DriverProfile } from "@/types/driverWorkspace";
import { formatPhoneNumber } from "@/utils/phone";
import {UsStateSelect} from "@/components/ui/UsStateSelect";

interface DriverProfileEditModalProps {
  profile: DriverProfile;
  saving: boolean;
  onClose: () => void;
  onSave: (profile: DriverProfile) => void;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-semibold text-slate-700"><span>{label}{required ? " *" : ""}</span>{children}</label>;
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100";

export function DriverProfileEditModal({ profile, saving, onClose, onSave }: DriverProfileEditModalProps) {
  const [form, setForm] = useState<DriverProfile>(profile);
  useEffect(() => setForm(profile), [profile]);
  const update = <K extends keyof DriverProfile>(key: K, value: DriverProfile[K]) => setForm((current) => ({ ...current, [key]: value }));

  return <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 sm:items-center sm:justify-center sm:p-6" role="dialog" aria-modal="true" aria-label="Edit driver profile"><div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold tracking-wider text-orange-600">DRIVER PROFILE</p><h2 className="mt-1 text-2xl font-bold text-slate-950">Edit your information</h2><p className="mt-1 text-sm text-slate-500">Your email is used for sign-in and cannot be changed here.</p></div><button type="button" onClick={onClose} disabled={saving} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button></div>
    <div className="mt-6 space-y-6"><section><h3 className="font-bold text-slate-900">Personal information</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="First name" required><input className={inputClass} value={form.firstName} onChange={(event) => update("firstName", event.target.value)} /></Field><Field label="Middle name"><input className={inputClass} value={form.middleName} onChange={(event) => update("middleName", event.target.value)} /></Field><Field label="Last name" required><input className={inputClass} value={form.lastName} onChange={(event) => update("lastName", event.target.value)} /></Field><Field label="Phone number" required><input className={inputClass} inputMode="tel" value={form.phone} onChange={(event) => update("phone", formatPhoneNumber(event.target.value))} placeholder="(000) 000 - 0000" /></Field></div></section>
    <section className="border-t border-slate-100 pt-6"><h3 className="font-bold text-slate-900">Home address</h3><p className="mt-1 text-sm text-slate-500">Changing this address verifies new coordinates for delivery eligibility.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Street address" required><input className={inputClass} value={form.address.street} onChange={(event) => update("address", { ...form.address, street: event.target.value })} /></Field></div><Field label="Apartment or unit"><input className={inputClass} value={form.address.apartment} onChange={(event) => update("address", { ...form.address, apartment: event.target.value })} /></Field><Field label="City" required><input className={inputClass} value={form.address.city} onChange={(event) => update("address", { ...form.address, city: event.target.value })} /></Field><Field label="State" required><UsStateSelect className={inputClass} value={form.address.state} onChange={(state) => update("address", { ...form.address, state })} /></Field><Field label="ZIP code" required><input className={inputClass} inputMode="numeric" value={form.address.zip} onChange={(event) => update("address", { ...form.address, zip: event.target.value })} /></Field></div></section>
    <section className="border-t border-slate-100 pt-6"><h3 className="font-bold text-slate-900">Service area</h3><div className="mt-3 grid gap-3 sm:grid-cols-3"><Field label="City" required><input className={inputClass} value={form.serviceArea.city} onChange={(event) => update("serviceArea", { ...form.serviceArea, city: event.target.value })} /></Field><Field label="State" required><UsStateSelect className={inputClass} value={form.serviceArea.state} onChange={(state) => update("serviceArea", { ...form.serviceArea, state })} /></Field><Field label="Preferred radius (miles)" required><input className={inputClass} type="number" min="1" max="50" value={form.serviceArea.preferredRadiusMiles ?? ""} onChange={(event) => update("serviceArea", { ...form.serviceArea, preferredRadiusMiles: event.target.value ? Number(event.target.value) : null })} /></Field></div></section>
    <section className="border-t border-slate-100 pt-6"><h3 className="font-bold text-slate-900">Vehicle information</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Make" required><input className={inputClass} value={form.vehicle.make} onChange={(event) => update("vehicle", { ...form.vehicle, make: event.target.value })} /></Field><Field label="Model" required><input className={inputClass} value={form.vehicle.model} onChange={(event) => update("vehicle", { ...form.vehicle, model: event.target.value })} /></Field><Field label="Year" required><input className={inputClass} type="number" min="1900" value={form.vehicle.year ?? ""} onChange={(event) => update("vehicle", { ...form.vehicle, year: event.target.value ? Number(event.target.value) : null })} /></Field><Field label="Color" required><input className={inputClass} value={form.vehicle.color} onChange={(event) => update("vehicle", { ...form.vehicle, color: event.target.value })} /></Field><Field label="License plate" required><input className={inputClass} value={form.vehicle.licensePlate} onChange={(event) => update("vehicle", { ...form.vehicle, licensePlate: event.target.value.toUpperCase() })} /></Field><Field label="Registration state" required><input className={inputClass} maxLength={2} value={form.vehicle.registrationState} onChange={(event) => update("vehicle", { ...form.vehicle, registrationState: event.target.value.toUpperCase() })} placeholder="IA" /></Field></div></section></div>
    <div className="sticky bottom-0 mt-6 flex gap-3 border-t border-slate-100 bg-white pt-4"><button type="button" disabled={saving} onClick={onClose} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">Cancel</button><button type="button" disabled={saving} onClick={() => onSave(form)} className="flex-1 rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving…" : "Save changes"}</button></div></div></div>;
}

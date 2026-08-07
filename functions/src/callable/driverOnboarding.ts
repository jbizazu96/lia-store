/*
|--------------------------------------------------------------------------
| Driver Onboarding Callables
|--------------------------------------------------------------------------
|
| Driver applications contain identity, address, vehicle, and document
| information. They are therefore callable-only: the browser supplies input
| and private Storage bytes, while this module validates and persists every
| protected Firestore change with the Admin SDK.
|
*/

import * as admin from "firebase-admin";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { DRIVER_LEGAL_CONFIG } from "../config/driverLegal";
import {
  getDriverApplicationPolicy,
  type DriverApplicationPolicy,
} from "../admin/driverApplicationPolicy";

if (admin.apps.length === 0) admin.initializeApp();

const db = getFirestore("default");
const googleMapsApiKey = defineSecret("GOOGLE_MAPS_API_KEY");
const imageFields = ["profile-photo", "drivers-license-front", "drivers-license-back", "vehicle-insurance", "vehicle-registration"] as const;
type ImageField = typeof imageFields[number];

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function upper(value: unknown): string { return text(value).toUpperCase(); }
function state(value: unknown): string | null { const normalized = upper(value); return /^[A-Z]{2}$/.test(normalized) ? normalized : null; }
function futureDate(value: string): boolean { const date = new Date(`${value}T00:00:00`); const today = new Date(); today.setHours(0, 0, 0, 0); return !Number.isNaN(date.getTime()) && date > today; }
function age(value: string): number { const birth = new Date(`${value}T00:00:00`); const today = new Date(); let result = today.getFullYear() - birth.getFullYear(); if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) result--; return result; }
function ownedUser(uid: string, user: FirebaseFirestore.DocumentSnapshot) { if (user.data()?.accountType !== "driver") throw new HttpsError("permission-denied", "Only drivers can update a driver application."); }
async function driverFor(uid: string, required = true) {
  const [user, driver] = await Promise.all([db.collection("users").doc(uid).get(), db.collection("drivers").doc(uid).get()]);
  ownedUser(uid, user);
  if (required && (!driver.exists || driver.data()?.ownerUid !== uid)) throw new HttpsError("permission-denied", "You do not own this driver application.");
  return { user, driver };
}
function safeDraft(uid: string, data: FirebaseFirestore.DocumentData | undefined) { return { driverId: uid, ...(data ?? {}) }; }
async function geocode(rawAddress: string) {
  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(rawAddress)}&key=${encodeURIComponent(googleMapsApiKey.value())}`);
  const body = await response.json().catch(() => ({})) as {
    status?: string;
    results?: Array<{
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
    }>;
  };
  const result = response.ok && body.status === "OK" ? body.results?.[0] : null;
  const lat = result?.geometry?.location?.lat; const lng = result?.geometry?.location?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") throw new HttpsError("invalid-argument", "We could not verify your home address. Check the street, city, state, and ZIP code.");
  return { formattedAddress: result?.formatted_address ?? rawAddress, latitude: lat, longitude: lng };
}
function requireComplete(
  data: FirebaseFirestore.DocumentData,
  policy: DriverApplicationPolicy,
) {
  const address = record(data.address) ? data.address : {}; const area = record(data.serviceArea) ? data.serviceArea : {}; const vehicle = record(data.vehicle) ? data.vehicle : {};
  const license = record(data.driversLicense) ? data.driversLicense : {}; const insurance = record(data.vehicleInsurance) ? data.vehicleInsurance : {}; const registration = record(data.vehicleRegistration) ? data.vehicleRegistration : {}; const agreements = record(data.agreements) ? data.agreements : {};
  const terms = record(agreements.terms) ? agreements.terms : {}; const privacy = record(agreements.privacyPolicy) ? agreements.privacyPolicy : {}; const driverAgreement = record(agreements.driverAgreement) ? agreements.driverAgreement : {};
  const missing: string[] = [];
  if (!text(data.firstName) || !text(data.lastName) || !/^\(\d{3}\) \d{3} - \d{4}$/.test(text(data.phone)) || !text(data.email) || age(text(data.dateOfBirth)) < policy.minimumAge) missing.push("personal information");
  if (!text(address.street) || !text(address.city) || !state(address.state) || !text(address.zip) || typeof address.latitude !== "number" || typeof address.longitude !== "number") missing.push("verified home address");
  if (!text(area.city) || !state(area.state) || typeof area.preferredRadiusMiles !== "number" || area.preferredRadiusMiles <= 0 || area.preferredRadiusMiles > policy.maximumPreferredRadiusMiles) missing.push("service area");
  if (!["car", "motorcycle", "scooter"].includes(text(data.deliveryMethod)) || !text(vehicle.make) || !text(vehicle.model) || typeof vehicle.year !== "number" || !text(vehicle.color) || !text(vehicle.licensePlate) || !state(vehicle.registrationState)) missing.push("vehicle information");
  const licenseRequired = policy.requiredDocuments.driversLicenseFront || policy.requiredDocuments.driversLicenseBack;
  if (licenseRequired && (
    (policy.requiredDocuments.driversLicenseFront && !text(license.frontDocumentUrl)) ||
    (policy.requiredDocuments.driversLicenseBack && !text(license.backDocumentUrl)) ||
    !state(license.issuingState) ||
    !futureDate(text(license.expirationDate))
  )) missing.push("driver's license");
  if (policy.requiredDocuments.vehicleInsurance && (!text(insurance.documentUrl) || !futureDate(text(insurance.expirationDate)))) missing.push("vehicle insurance");
  if (policy.requiredDocuments.vehicleRegistration && (!text(registration.documentUrl) || !futureDate(text(registration.expirationDate)))) missing.push("vehicle registration");
  if (terms.accepted !== true || privacy.accepted !== true || driverAgreement.accepted !== true || agreements.informationCertifiedAccurate !== true) missing.push("required agreements");
  if (policy.requireStripeAccount && !text(data.stripeAccountId)) missing.push("Stripe payout setup");
  if (missing.length) throw new HttpsError("failed-precondition", `Complete the following before submitting your application: ${missing.join(", ")}.`);
}

export const getDriverOnboardingDraft = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view onboarding.");
  const { driver } = await driverFor(request.auth.uid, false);
  return {
    ...safeDraft(request.auth.uid, driver.data()),
    applicationPolicy: await getDriverApplicationPolicy(),
  };
});

export const saveDriverPersonalInformation = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to save onboarding.");
  const input = record(request.data) ? request.data : {}; const firstName = text(input.firstName); const middleName = text(input.middleName); const lastName = text(input.lastName); const phone = text(input.phone); const email = text(input.email); const dateOfBirth = text(input.dateOfBirth);
  const policy = await getDriverApplicationPolicy();
  if (!firstName || !lastName || !/^\(\d{3}\) \d{3} - \d{4}$/.test(phone) || !/^\S+@\S+\.\S+$/.test(email) || !dateOfBirth || age(dateOfBirth) < policy.minimumAge) throw new HttpsError("invalid-argument", `Enter complete personal information. Drivers must be at least ${policy.minimumAge} years old.`);
  const { driver } = await driverFor(request.auth.uid, false); const existing = driver.data() ?? {}; const reference = db.collection("drivers").doc(request.auth.uid);
  await reference.set({ ownerUid: request.auth.uid, firstName, middleName: middleName || null, lastName, phone, email, dateOfBirth, isApproved: existing.isApproved === true, onboardingCompleted: existing.onboardingCompleted === true, onboardingStep: existing.onboardingCompleted === true ? existing.onboardingStep ?? "stripe" : "address-service-area", status: text(existing.status) || "draft", availabilityStatus: text(existing.availabilityStatus) || "offline", createdAt: existing.createdAt ?? FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await db.collection("users").doc(request.auth.uid).set({ displayName: `${firstName} ${lastName}`, phone, email, driverId: request.auth.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return safeDraft(request.auth.uid, (await reference.get()).data());
});

export const saveDriverAddressAndServiceArea = onCall({ region: "us-central1", secrets: [googleMapsApiKey] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to save onboarding.");
  const input = record(request.data) ? request.data : {}; const address = record(input.address) ? input.address : {}; const area = record(input.serviceArea) ? input.serviceArea : {}; const addressState = state(address.state); const areaState = state(area.state); const radius = typeof area.preferredRadiusMiles === "number" ? area.preferredRadiusMiles : null;
  const policy = await getDriverApplicationPolicy();
  if (!text(address.street) || !text(address.city) || !addressState || !text(address.zip) || !text(area.city) || !areaState || !radius || radius <= 0 || radius > policy.maximumPreferredRadiusMiles) throw new HttpsError("invalid-argument", `Select a preferred service radius between 1 and ${policy.maximumPreferredRadiusMiles} miles.`);
  const verified = await geocode(`${text(address.street)}${text(address.apartment) ? `, ${text(address.apartment)}` : ""}, ${text(address.city)}, ${addressState} ${text(address.zip)}`); const { driver } = await driverFor(request.auth.uid); const approvedRadius = record(driver.data()?.serviceArea) && typeof driver.data()?.serviceArea.approvedRadiusMiles === "number" ? driver.data()?.serviceArea.approvedRadiusMiles : null;
  await driver.ref.update({ address: { street: upper(address.street), apartment: upper(address.apartment) || null, city: upper(address.city), state: addressState, zip: upper(address.zip), formattedAddress: upper(verified.formattedAddress), latitude: verified.latitude, longitude: verified.longitude }, serviceArea: { city: upper(area.city), state: areaState, preferredRadiusMiles: radius, approvedRadiusMiles: approvedRadius }, onboardingStep: "vehicle-information", updatedAt: FieldValue.serverTimestamp() });
  return safeDraft(request.auth.uid, (await driver.ref.get()).data());
});

export const saveDriverVehicleInformation = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to save onboarding.");
  const input = record(request.data) ? request.data : {}; const vehicle = record(input.vehicle) ? input.vehicle : {}; const method = text(input.deliveryMethod); const registrationState = state(vehicle.registrationState); const year = typeof vehicle.year === "number" ? vehicle.year : null;
  if (!["car", "motorcycle", "scooter"].includes(method) || !text(vehicle.make) || !text(vehicle.model) || !year || year < 1900 || year > new Date().getFullYear() + 1 || !text(vehicle.color) || !text(vehicle.licensePlate) || !registrationState) throw new HttpsError("invalid-argument", "Complete every required vehicle field.");
  const { driver } = await driverFor(request.auth.uid); await driver.ref.update({ deliveryMethod: method, vehicle: { make: text(vehicle.make), model: text(vehicle.model), year, color: text(vehicle.color), licensePlate: upper(vehicle.licensePlate), registrationState }, onboardingStep: "documents", updatedAt: FieldValue.serverTimestamp() }); return safeDraft(request.auth.uid, (await driver.ref.get()).data());
});

export const prepareDriverImageUpload = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in before uploading.");
  const input = record(request.data) ? request.data : {}; const field = text(input.field) as ImageField; const extension = text(input.extension).replace(/[^a-z0-9]/gi, "").toLowerCase(); const contentType = text(input.contentType);
  if (!imageFields.includes(field) || !["jpg", "jpeg", "png", "webp", "avif", "heic", "heif"].includes(extension) || !/^image\/(jpeg|png|webp|avif|heic|heif)$/.test(contentType)) throw new HttpsError("invalid-argument", "Choose a supported image file.");
  const { driver } = await driverFor(request.auth.uid); const uploadId = crypto.randomUUID(); const path = `drivers/${request.auth.uid}/images/originals/${field}/${uploadId}.${extension}`;
  const update: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (field === "drivers-license-front" || field === "drivers-license-back") Object.assign(update, { "driversLicense.reviewStatus": "pending", "driversLicense.rejectionReason": null, "driversLicense.reviewedAt": null, "driversLicense.reviewedBy": null });
  if (field === "vehicle-insurance") Object.assign(update, { "vehicleInsurance.reviewStatus": "pending", "vehicleInsurance.rejectionReason": null, "vehicleInsurance.reviewedAt": null, "vehicleInsurance.reviewedBy": null });
  if (field === "vehicle-registration") Object.assign(update, { "vehicleRegistration.reviewStatus": "pending", "vehicleRegistration.rejectionReason": null, "vehicleRegistration.reviewedAt": null, "vehicleRegistration.reviewedBy": null });
  await driver.ref.update(update);
  await db.collection("driverImageUploads").doc(uploadId).set({ driverId: request.auth.uid, field, path, status: "prepared", createdAt: FieldValue.serverTimestamp(), expiresAt: new Date(Date.now() + 15 * 60 * 1000) });
  return { uploadId, path };
});

export const saveDriverDocuments = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to save onboarding.");
  const input = record(request.data) ? request.data : {}; const files = record(input.files) ? input.files : {}; const issuingState = state(input.issuingState); const licenseExpirationDate = text(input.licenseExpirationDate); const insuranceExpirationDate = text(input.insuranceExpirationDate); const registrationExpirationDate = text(input.registrationExpirationDate); const { driver } = await driverFor(request.auth.uid); const data = driver.data() ?? {}; const license = record(data.driversLicense) ? data.driversLicense : {}; const insurance = record(data.vehicleInsurance) ? data.vehicleInsurance : {}; const registration = record(data.vehicleRegistration) ? data.vehicleRegistration : {};
  const present = (key: ImageField, url: unknown) => files[key] === true || Boolean(text(url));
  const policy = await getDriverApplicationPolicy();
  const licenseRequired = policy.requiredDocuments.driversLicenseFront || policy.requiredDocuments.driversLicenseBack;
  if ((licenseRequired && (!issuingState || !futureDate(licenseExpirationDate) || (policy.requiredDocuments.driversLicenseFront && !present("drivers-license-front", license.frontDocumentUrl)) || (policy.requiredDocuments.driversLicenseBack && !present("drivers-license-back", license.backDocumentUrl)))) || (policy.requiredDocuments.vehicleInsurance && (!present("vehicle-insurance", insurance.documentUrl) || !futureDate(insuranceExpirationDate))) || (policy.requiredDocuments.vehicleRegistration && (!present("vehicle-registration", registration.documentUrl) || !futureDate(registrationExpirationDate)))) throw new HttpsError("invalid-argument", "Provide every required document and future expiration date.");
  await driver.ref.update({ "driversLicense.issuingState": issuingState, "driversLicense.expirationDate": licenseExpirationDate, "vehicleInsurance.provider": text(input.insuranceProvider) || null, "vehicleInsurance.expirationDate": insuranceExpirationDate, "vehicleRegistration.expirationDate": registrationExpirationDate, onboardingStep: "agreement", updatedAt: FieldValue.serverTimestamp() }); return safeDraft(request.auth.uid, (await driver.ref.get()).data());
});

export const saveDriverAgreement = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to save onboarding."); const input = record(request.data) ? request.data : {};
  if (input.acceptedTerms !== true || input.acceptedPrivacyPolicy !== true || input.acceptedDriverAgreement !== true || input.informationCertifiedAccurate !== true) throw new HttpsError("invalid-argument", "Accept every agreement before continuing.");
  const { driver } = await driverFor(request.auth.uid); const now = FieldValue.serverTimestamp(); await driver.ref.update({ agreements: { terms: { accepted: true, version: DRIVER_LEGAL_CONFIG.TERMS_VERSION, acceptedAt: now }, privacyPolicy: { accepted: true, version: DRIVER_LEGAL_CONFIG.PRIVACY_POLICY_VERSION, acceptedAt: now }, driverAgreement: { accepted: true, version: DRIVER_LEGAL_CONFIG.DRIVER_AGREEMENT_VERSION, acceptedAt: now }, informationCertifiedAccurate: true }, onboardingStep: "stripe", updatedAt: FieldValue.serverTimestamp() }); return safeDraft(request.auth.uid, (await driver.ref.get()).data());
});

export const completeDriverOnboarding = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to submit onboarding."); const { driver } = await driverFor(request.auth.uid); const data = driver.data() ?? {}; requireComplete(data, await getDriverApplicationPolicy());
  await driver.ref.update({ onboardingCompleted: true, status: "pending_review", availabilityStatus: "offline", submittedAt: data.submittedAt ?? FieldValue.serverTimestamp(), onboardingStep: "stripe", updatedAt: FieldValue.serverTimestamp() }); await db.collection("users").doc(request.auth.uid).set({ onboardingCompleted: true, driverId: request.auth.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); return { success: true };
});

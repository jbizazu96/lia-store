/*
|--------------------------------------------------------------------------
| Store Onboarding Callables
|--------------------------------------------------------------------------
|
| The store-owner browser never creates or updates stores/{storeId} or
| users/{uid}. Each callable derives the owner from Firebase Authentication,
| verifies the store_owner role, and performs the protected Firestore work
| with the Admin SDK.
|
| Store images are uploaded by the browser only to its owner-protected
| Storage path. These callables verify that a required upload exists before
| advancing an onboarding step.
|
*/

import * as admin from "firebase-admin";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {
  getStorage,
} from "firebase-admin/storage";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import {
  defineSecret,
} from "firebase-functions/params";
import {
  grantStoreUploadClaim,
} from "../services/store/storeUploadClaimService";
import {resolveDeliveryZoneForAddress, zoneFields} from "../delivery/deliveryZoneAssignmentService";
import {
  getStoreApplicationPolicy,
  type StoreApplicationPolicy,
} from "../admin/storeApplicationPolicy";
import {enforceCallableAbuseProtection} from "../security/callableAbuseProtection";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");
const googleMapsApiKey = defineSecret("GOOGLE_MAPS_API_KEY");
const defaultMinimumOrder = 30;

type StoreImageField =
  | "logo"
  | "banner"
  | "owner-photo-id"
  | "front"
  | "inside";
type StoreOnboardingStep =
  | "owner"
  | "store-information"
  | "business-information"
  | "schedule"
  | "stripe";

type ScheduleDay = {
  day: string;
  open: string;
  close: string;
  isClosed: boolean;
};

const scheduleDays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const defaultSchedule: ScheduleDay[] = [
  { day: "Monday", open: "09:00", close: "18:00", isClosed: false },
  { day: "Tuesday", open: "09:00", close: "18:00", isClosed: false },
  { day: "Wednesday", open: "09:00", close: "18:00", isClosed: false },
  { day: "Thursday", open: "09:00", close: "18:00", isClosed: false },
  { day: "Friday", open: "09:00", close: "18:00", isClosed: false },
  { day: "Saturday", open: "10:00", close: "16:00", isClosed: false },
  { day: "Sunday", open: "00:00", close: "00:00", isClosed: true },
];

const stateCodes: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR",
  california: "CA", colorado: "CO", connecticut: "CT", delaware: "DE",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI",
  minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "district of columbia": "DC", dc: "DC",
};
const validStateCodes = new Set(Object.values(stateCodes));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function upper(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeState(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  const byName = stateCodes[normalized.toLowerCase()];
  if (byName) return byName;
  const code = normalized.toUpperCase();
  return validStateCodes.has(code) ? code : null;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new HttpsError("invalid-argument", "A valid onboarding request is required.");
  }
  return value;
}

function pendingReview() {
  return {
    reviewStatus: "pending",
    rejectionReason: null,
    reviewedAt: null,
    reviewedBy: null,
  };
}

function review(value: unknown) {
  const data = isRecord(value) ? value : {};
  const status = text(data.reviewStatus);
  return {
    reviewStatus: status === "approved" || status === "rejected" || status === "expired" || status === "pending"
      ? status
      : "pending",
    rejectionReason: typeof data.rejectionReason === "string" ? data.rejectionReason : null,
    reviewedAt: timestampValue(data.reviewedAt),
    reviewedBy: typeof data.reviewedBy === "string" ? data.reviewedBy : null,
  };
}

function timestampValue(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date ? date.toISOString() : null;
  }
  return typeof value === "string" ? value : null;
}

async function requireStoreOwner(uid: string) {
  const user = await db.collection("users").doc(uid).get();
  if (user.data()?.accountType !== "store_owner") {
    throw new HttpsError("permission-denied", "Only store owners can manage a store application.");
  }
  if (["deletion_pending", "deletion_processing"].includes(user.data()?.accountDeletionState)) {
    throw new HttpsError("failed-precondition", "Store onboarding is unavailable while account deletion is pending.");
  }
}

async function ownedStore(uid: string) {
  const user = await db.collection("users").doc(uid).get();
  const storeId = text(user.data()?.storeId);

  if (storeId) {
    const store = await db.collection("stores").doc(storeId).get();
    if (store.exists && store.data()?.ownerId === uid) return store;
  }

  const stores = await db.collection("stores").where("ownerId", "==", uid).limit(1).get();
  return stores.docs[0] ?? null;
}

async function requireOwnedStore(uid: string) {
  const store = await ownedStore(uid);
  if (!store) throw new HttpsError("failed-precondition", "Complete owner information first.");
  return store;
}

function mapDraft(storeId: string | null, ownerId: string, value?: Record<string, unknown>) {
  const data = value ?? {};
  const owner = isRecord(data.owner) ? data.owner : {};
  const step = text(data.onboardingStep);
  const status = text(data.status);
  const schedule = Array.isArray(data.schedule) ? data.schedule : defaultSchedule;

  return {
    storeId,
    ownerId,
    isApproved: data.isApproved === true,
    isActive: data.isActive === true,
    onboardingCompleted: data.onboardingCompleted === true,
    onboardingStep: step === "owner" || step === "store-information" || step === "business-information" || step === "schedule" || step === "stripe" ? step : "owner",
    status: status === "draft" || status === "pending_review" || status === "approved" || status === "rejected" || status === "suspended" ? status : data.isApproved === true ? "approved" : "draft",
    submittedAt: timestampValue(data.submittedAt),
    owner: {
      firstName: text(owner.firstName), lastName: text(owner.lastName),
      email: text(owner.email), phone: text(owner.phone),
      address: text(owner.address), city: text(owner.city), state: text(owner.state), zip: text(owner.zip),
      formattedAddress: text(owner.formattedAddress) || undefined,
      photoIdUrl: text(owner.photoIdUrl) || undefined,
      photoIdReview: review(owner.photoIdReview),
      photoIdSubmissionVersion: typeof owner.photoIdSubmissionVersion === "number" ? owner.photoIdSubmissionVersion : 0,
    },
    name: text(data.name), email: text(data.email), phone: text(data.phone),
    description: text(data.description), address: text(data.address), city: text(data.city), state: text(data.state), zip: text(data.zip),
    formattedAddress: text(data.formattedAddress), logoUrl: text(data.logoUrl) || undefined,
    logoReview: review(data.logoReview), logoSubmissionVersion: typeof data.logoSubmissionVersion === "number" ? data.logoSubmissionVersion : 0,
    bannerUrl: text(data.bannerUrl) || undefined,
    bannerReview: review(data.bannerReview), bannerSubmissionVersion: typeof data.bannerSubmissionVersion === "number" ? data.bannerSubmissionVersion : 0,
    storeFrontUrl: text(data.storeFrontUrl) || undefined,
    storeFrontReview: review(data.storeFrontReview), storeFrontSubmissionVersion: typeof data.storeFrontSubmissionVersion === "number" ? data.storeFrontSubmissionVersion : 0,
    storeInsideUrl: text(data.storeInsideUrl) || undefined,
    storeInsideReview: review(data.storeInsideReview), storeInsideSubmissionVersion: typeof data.storeInsideSubmissionVersion === "number" ? data.storeInsideSubmissionVersion : 0,
    businessType: text(data.businessType), registeredName: text(data.registeredName), ein: text(data.ein), businessStructure: text(data.businessStructure),
    schedule,
    stripeAccountId: text(data.stripeAccountId) || undefined,
    stripeAccountStatus: text(data.stripeAccountStatus) || undefined,
    stripeDetailsSubmitted: data.stripeDetailsSubmitted === true,
    stripeTransfersEnabled: data.stripeTransfersEnabled === true,
    stripePayoutsEnabled: data.stripePayoutsEnabled === true,
    stripeRequiresAction: data.stripeRequiresAction === true,
  };
}

function fullAddress(input: Record<string, unknown>): string {
  return `${text(input.address)}, ${text(input.city)}, ${text(input.state)} ${text(input.zip)}`;
}

async function geocodeAddress(address: string) {
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${encodeURIComponent(googleMapsApiKey.value())}`,
  );
  if (!response.ok) return null;
  const body = await response.json() as {
    status?: unknown;
    results?: Array<{ formatted_address?: unknown; place_id?: unknown; geometry?: { location?: { lat?: unknown; lng?: unknown } } }>;
  };
  const result = body.status === "OK" ? body.results?.[0] : null;
  const latitude = result?.geometry?.location?.lat;
  const longitude = result?.geometry?.location?.lng;
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  return {
    latitude,
    longitude,
    formattedAddress: text(result?.formatted_address) || address,
    placeId: text(result?.place_id) || null,
  };
}

async function hasUploadedImage(storeId: string, field: StoreImageField): Promise<boolean> {
  const bucket = getStorage().bucket();
  const [originals] = await bucket.getFiles({
    prefix: `stores/${storeId}/images/originals/${field}/`,
    maxResults: 1,
  });
  if (originals.length > 0) return true;
  const [optimized] = await bucket.getFiles({
    prefix: `stores/${storeId}/images/optimized/${field}/`,
    maxResults: 1,
  });
  return optimized.length > 0;
}

function scheduleError(value: unknown): string | null {
  if (!Array.isArray(value) || value.length !== scheduleDays.length) return "Add each day of the week to the store schedule.";
  const schedule = value.filter(isRecord).map((day) => ({ day: text(day.day), open: text(day.open), close: text(day.close), isClosed: day.isClosed === true }));
  if (schedule.length !== scheduleDays.length || new Set(schedule.map((day) => day.day)).size !== schedule.length || !scheduleDays.every((day) => schedule.some((saved) => saved.day === day))) return "Include every day of the week only once.";
  const openDays = schedule.filter((day) => !day.isClosed);
  if (openDays.length === 0) return "Set opening and closing hours for at least one day.";
  for (const day of openDays) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(day.open) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(day.close)) return `Enter valid opening and closing times for ${day.day}.`;
    const [openHour, openMinute] = day.open.split(":").map(Number);
    const [closeHour, closeMinute] = day.close.split(":").map(Number);
    if (closeHour * 60 + closeMinute <= openHour * 60 + openMinute) return `${day.day} must close after it opens. Overnight hours are not supported yet.`;
  }
  return null;
}

function requireCompleteApplication(
  draft: ReturnType<typeof mapDraft>,
  policy: StoreApplicationPolicy,
) {
  const missing: string[] = [];
  if (!draft.owner.firstName || !draft.owner.lastName || !draft.owner.email || !draft.owner.phone || !draft.owner.address || !draft.owner.city || !draft.owner.state || !draft.owner.zip || !draft.owner.formattedAddress || (policy.requiredDocuments.ownerPhotoId && !draft.owner.photoIdUrl)) missing.push("owner information");
  if (!draft.name || !draft.email || !draft.phone || !draft.description || !draft.address || !draft.city || !draft.state || !draft.zip || !draft.formattedAddress || (policy.requiredDocuments.logo && !draft.logoUrl) || (policy.requiredDocuments.banner && !draft.bannerUrl)) missing.push("store information");
  if (!draft.businessType || !draft.registeredName || !draft.businessStructure || (policy.requiredDocuments.storeFront && !draft.storeFrontUrl) || (policy.requiredDocuments.storeInside && !draft.storeInsideUrl)) missing.push("business information");
  if (scheduleError(draft.schedule)) missing.push("business schedule");
  /*
   * Stripe may take time to verify the submitted payout details. A store can
   * submit its LIA application as soon as it has completed Stripe's hosted
   * form and has a connected account; approval and marketplace activation
   * remain separate administrative decisions.
   */
  if (policy.requireStripeAccount && !draft.stripeAccountId) missing.push("Stripe payment setup");
  if (missing.length > 0) throw new HttpsError("failed-precondition", `Complete the following before submitting your store: ${missing.join(", ")}.`);
}

function lifecycleFor(existing: Record<string, unknown>) {
  const complete = existing.onboardingCompleted === true;
  return {
    isApproved: existing.isApproved === true,
    isActive: existing.isActive === true,
    status: text(existing.status) || "draft",
    onboardingCompleted: complete,
    onboardingStep: complete ? text(existing.onboardingStep) || "stripe" : "store-information",
    minimumOrder: typeof existing.minimumOrder === "number" ? existing.minimumOrder : defaultMinimumOrder,
    isOpen: existing.isOpen === true,
  };
}

export const getStoreOnboardingDraft = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to open store onboarding.");
  await requireStoreOwner(request.auth.uid);
  const store = await ownedStore(request.auth.uid);
  return {
    ...mapDraft(store?.id ?? null, request.auth.uid, store?.data()),
    applicationPolicy: await getStoreApplicationPolicy(),
  };
});

export const ensureStoreOnboardingDraft = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to start store onboarding.");
  await requireStoreOwner(request.auth.uid);
  const existing = await ownedStore(request.auth.uid);
  if (existing) {
    await grantStoreUploadClaim(request.auth.uid, existing.id);
    return mapDraft(existing.id, request.auth.uid, existing.data());
  }

  const storeReference = db.collection("stores").doc();
  await storeReference.set({
    ownerId: request.auth.uid,
    owner: { photoIdReview: pendingReview(), photoIdSubmissionVersion: 0 },
    isApproved: false,
    isActive: false,
    status: "draft",
    onboardingCompleted: false,
    onboardingStep: "owner",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db.collection("users").doc(request.auth.uid).set({ storeId: storeReference.id, onboardingCompleted: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await grantStoreUploadClaim(request.auth.uid, storeReference.id);
  return mapDraft(storeReference.id, request.auth.uid, { ownerId: request.auth.uid });
});

export const saveStoreOnboardingOwner = onCall({ region: "us-central1", secrets: [googleMapsApiKey] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to save owner information.");
  await enforceCallableAbuseProtection({operation: "store-owner-geocode", uid: request.auth.uid, appCheckVerified: Boolean(request.app), maximumRequests: 10, windowSeconds: 3_600});
  await requireStoreOwner(request.auth.uid);
  const input = requireRecord(requireRecord(request.data).owner);
  const state = normalizeState(text(input.state));
  if (!text(input.firstName).trim() || !text(input.lastName).trim() || !text(input.email).trim() || !text(input.phone).trim() || !text(input.address).trim() || !text(input.city).trim() || !state || !text(input.zip).trim()) throw new HttpsError("invalid-argument", "Complete every required owner field with a valid two-letter state.");
  const store = await requireOwnedStore(request.auth.uid);
  const data = store.data() ?? {};
  const owner = isRecord(data.owner) ? data.owner : {};
  const policy = await getStoreApplicationPolicy();
  if (policy.requiredDocuments.ownerPhotoId && !(await hasUploadedImage(store.id, "owner-photo-id")) && !text(owner.photoIdUrl)) throw new HttpsError("failed-precondition", "Upload a photo ID.");
  const location = await geocodeAddress(fullAddress({ ...input, state }));
  if (!location) throw new HttpsError("invalid-argument", "We couldn't verify your home address. Check the street, city, state, and ZIP code.");
  const zone = await resolveDeliveryZoneForAddress(input.city, state, input.zip, location.placeId);
  const photoChanged = requireRecord(request.data).photoIdUploaded === true;
  await store.ref.update({
    ownerId: request.auth.uid,
    "owner.firstName": text(input.firstName).trim(), "owner.lastName": text(input.lastName).trim(), "owner.email": text(input.email).trim(), "owner.phone": text(input.phone).trim(),
    "owner.address": upper(text(input.address)), "owner.city": upper(text(input.city)), "owner.state": state, "owner.zip": upper(text(input.zip)), "owner.formattedAddress": upper(location.formattedAddress),
    ...(photoChanged ? { "owner.photoIdReview": pendingReview(), "owner.photoIdSubmissionVersion": (typeof owner.photoIdSubmissionVersion === "number" ? owner.photoIdSubmissionVersion : 0) + 1 } : {}),
    ...lifecycleFor(data),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db.collection("users").doc(request.auth.uid).set({
    storeId: store.id, onboardingCompleted: data.onboardingCompleted === true,
    displayName: `${text(input.firstName).trim()} ${text(input.lastName).trim()}`,
    email: text(input.email).trim(), phone: text(input.phone).trim(),
    defaultAddress: { street: upper(text(input.address)), city: upper(text(input.city)), state, zip: upper(text(input.zip)), latitude: location.latitude, longitude: location.longitude, formattedAddress: upper(location.formattedAddress), ...zoneFields(zone) },
    homeZoneId: zone?.id ?? null, homeZoneName: zone?.name ?? null, zoneAssignmentSource: "automatic",
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  const updated = await store.ref.get();
  return mapDraft(store.id, request.auth.uid, updated.data());
});

export const saveStoreOnboardingStoreInformation = onCall({ region: "us-central1", secrets: [googleMapsApiKey] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to save store information.");
  await enforceCallableAbuseProtection({operation: "store-address-geocode", uid: request.auth.uid, appCheckVerified: Boolean(request.app), maximumRequests: 10, windowSeconds: 3_600});
  await requireStoreOwner(request.auth.uid);
  const input = requireRecord(request.data);
  const state = normalizeState(text(input.state));
  if (!text(input.name).trim() || !text(input.email).trim() || !text(input.phone).trim() || !text(input.description).trim() || !text(input.address).trim() || !text(input.city).trim() || !state || !text(input.zip).trim()) throw new HttpsError("invalid-argument", "Complete every required store field with a valid two-letter state.");
  const store = await requireOwnedStore(request.auth.uid);
  const data = store.data() ?? {};
  const policy = await getStoreApplicationPolicy();
  if (policy.requiredDocuments.logo && !(await hasUploadedImage(store.id, "logo")) && !text(data.logoUrl)) throw new HttpsError("failed-precondition", "Upload a store logo.");
  if (policy.requiredDocuments.banner && !(await hasUploadedImage(store.id, "banner")) && !text(data.bannerUrl)) throw new HttpsError("failed-precondition", "Upload a store banner.");
  const location = await geocodeAddress(fullAddress({ ...input, state }));
  if (!location) throw new HttpsError("invalid-argument", "We couldn't verify the store address. Check the street, city, state, and ZIP code.");
  const zone = await resolveDeliveryZoneForAddress(input.city, state, input.zip, location.placeId);
  const logoChanged = input.logoUploaded === true;
  const bannerChanged = input.bannerUploaded === true;
  await store.ref.update({
    name: text(input.name).trim(), email: text(input.email).trim(), phone: text(input.phone).trim(), description: text(input.description).trim(),
    address: upper(text(input.address)), city: upper(text(input.city)), state, zip: upper(text(input.zip)), country: "US",
    latitude: location.latitude, longitude: location.longitude, placeId: location.placeId, formattedAddress: upper(location.formattedAddress),
    homeZoneId: zone?.id ?? null, homeZoneName: zone?.name ?? null, zoneAssignmentSource: "automatic",
    serviceZoneIds: Array.isArray(data.serviceZoneIds) ? data.serviceZoneIds : [],
    ...(logoChanged ? { logoReview: pendingReview(), logoSubmissionVersion: (typeof data.logoSubmissionVersion === "number" ? data.logoSubmissionVersion : 0) + 1 } : {}),
    ...(bannerChanged ? { bannerReview: pendingReview(), bannerSubmissionVersion: (typeof data.bannerSubmissionVersion === "number" ? data.bannerSubmissionVersion : 0) + 1 } : {}),
    onboardingStep: data.onboardingCompleted === true ? text(data.onboardingStep) || "stripe" : "business-information",
    updatedAt: FieldValue.serverTimestamp(),
  });
  const updated = await store.ref.get();
  return mapDraft(store.id, request.auth.uid, updated.data());
});

export const saveStoreOnboardingBusinessInformation = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to save business information.");
  await requireStoreOwner(request.auth.uid);
  const input = requireRecord(request.data);
  if (!text(input.businessType) || !text(input.registeredName).trim() || !text(input.businessStructure)) throw new HttpsError("invalid-argument", "Complete every required business field.");
  const store = await requireOwnedStore(request.auth.uid);
  const data = store.data() ?? {};
  const policy = await getStoreApplicationPolicy();
  const missingStoreFront = policy.requiredDocuments.storeFront && !(await hasUploadedImage(store.id, "front")) && !text(data.storeFrontUrl);
  const missingStoreInside = policy.requiredDocuments.storeInside && !(await hasUploadedImage(store.id, "inside")) && !text(data.storeInsideUrl);
  if (missingStoreFront || missingStoreInside) throw new HttpsError("failed-precondition", "Upload every required store photo.");
  const frontChanged = input.storeFrontUploaded === true;
  const insideChanged = input.storeInsideUploaded === true;
  const structure = text(input.businessStructure);
  await store.ref.update({
    businessType: text(input.businessType), registeredName: text(input.registeredName).trim(), ein: text(input.ein).trim() || null, businessStructure: structure,
    stripeBusinessType: text(input.businessType), stripeAccountType: structure === "sole_proprietorship" || structure === "dba" ? "individual" : "company",
    ...(frontChanged ? { storeFrontReview: pendingReview(), storeFrontSubmissionVersion: (typeof data.storeFrontSubmissionVersion === "number" ? data.storeFrontSubmissionVersion : 0) + 1 } : {}),
    ...(insideChanged ? { storeInsideReview: pendingReview(), storeInsideSubmissionVersion: (typeof data.storeInsideSubmissionVersion === "number" ? data.storeInsideSubmissionVersion : 0) + 1 } : {}),
    onboardingStep: data.onboardingCompleted === true ? text(data.onboardingStep) || "stripe" : "schedule",
    updatedAt: FieldValue.serverTimestamp(),
  });
  const updated = await store.ref.get();
  return mapDraft(store.id, request.auth.uid, updated.data());
});

export const saveStoreOnboardingSchedule = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to save the store schedule.");
  await requireStoreOwner(request.auth.uid);
  const schedule = requireRecord(request.data).schedule;
  const error = scheduleError(schedule);
  if (error) throw new HttpsError("invalid-argument", error);
  const store = await requireOwnedStore(request.auth.uid);
  const data = store.data() ?? {};
  await store.ref.update({ schedule, isOpen: data.onboardingCompleted === true ? data.isOpen === true : false, onboardingStep: data.onboardingCompleted === true ? text(data.onboardingStep) || "stripe" : "stripe", updatedAt: FieldValue.serverTimestamp() });
  const updated = await store.ref.get();
  return mapDraft(store.id, request.auth.uid, updated.data());
});

export const completeStoreOnboarding = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to complete store onboarding.");
  await requireStoreOwner(request.auth.uid);
  const store = await requireOwnedStore(request.auth.uid);
  const data = store.data() ?? {};
  requireCompleteApplication(
    mapDraft(store.id, request.auth.uid, data),
    await getStoreApplicationPolicy(),
  );
  await store.ref.update({
    onboardingCompleted: true,
    onboardingStep: "stripe" as StoreOnboardingStep,
    status: data.isApproved === true ? "approved" : "pending_review",
    isApproved: data.isApproved === true,
    isActive: data.isActive === true,
    submittedAt: data.submittedAt ?? FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db.collection("users").doc(request.auth.uid).set({ onboardingCompleted: true, storeId: store.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { success: true };
});

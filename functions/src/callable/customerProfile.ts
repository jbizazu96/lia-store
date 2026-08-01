/*
|--------------------------------------------------------------------------
| Customer Profile Callables
|--------------------------------------------------------------------------
|
| Customer profile changes are handled in Firebase Functions instead of
| Vercel API routes. Every operation derives the customer from callable
| authentication, validates the customer account, and writes with Admin SDK.
|
*/

import * as admin from "firebase-admin";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import {
  defineSecret,
} from "firebase-functions/params";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");
const googleMapsApiKey = defineSecret("GOOGLE_MAPS_API_KEY");
const supportedLanguages = new Set(["English", "French", "Swahili"]);
const supportedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function upper(value: string): string {
  return value.trim().toUpperCase();
}

function stateCode(value: unknown): string | null {
  const normalized = upper(text(value));

  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function requireCustomer(uid: string) {
  const reference = db.collection("users").doc(uid);
  const snapshot = await reference.get();
  const data = snapshot.data();

  if (!snapshot.exists || data?.uid !== uid || data.accountType !== "customer") {
    throw new HttpsError(
      "permission-denied",
      "This account is not authorized to manage a customer profile."
    );
  }

  return { reference, data };
}

function profileResponse(data: Record<string, unknown>) {
  const address = isRecord(data.defaultAddress) ? data.defaultAddress : null;
  const hasAddress =
    address &&
    typeof address.street === "string" &&
    typeof address.city === "string" &&
    typeof address.state === "string" &&
    typeof address.zip === "string" &&
    typeof address.latitude === "number" &&
    typeof address.longitude === "number" &&
    typeof address.formattedAddress === "string";

  return {
    displayName: text(data.displayName),
    email: text(data.email),
    phone: text(data.phone),
    language: supportedLanguages.has(text(data.language))
      ? text(data.language)
      : "English",
    profileImageUrl: text(data.profileImageUrl),
    profileImageStatus:
      data.profileImageStatus === "processing" ||
      data.profileImageStatus === "ready" ||
      data.profileImageStatus === "failed"
        ? data.profileImageStatus
        : "idle",
    defaultAddress: hasAddress
      ? {
          street: address.street,
          city: address.city,
          state: address.state,
          zip: address.zip,
          latitude: address.latitude,
          longitude: address.longitude,
          formattedAddress: address.formattedAddress,
        }
      : null,
  };
}

async function verifyAddress(input: Record<string, unknown>) {
  const street = text(input.street);
  const city = text(input.city);
  const zip = text(input.zip);
  const state = stateCode(input.state);

  if (!street || !city || !zip || !state) {
    throw new HttpsError(
      "invalid-argument",
      "Enter a valid street, city, two-letter state, and ZIP code."
    );
  }

  const address = `${street}, ${city}, ${state} ${zip}`;
  const response = await fetch(
    "https://maps.googleapis.com/maps/api/geocode/json?address=" +
      encodeURIComponent(address) +
      "&key=" +
      encodeURIComponent(googleMapsApiKey.value())
  );
  const payload = await response.json() as {
    status?: string;
    results?: Array<{
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
    }>;
  };
  const result = payload.status === "OK" ? payload.results?.[0] : null;
  const latitude = result?.geometry?.location?.lat;
  const longitude = result?.geometry?.location?.lng;

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    throw new HttpsError(
      "invalid-argument",
      "We couldn't verify this delivery address. Check the street, city, state, and ZIP code."
    );
  }

  return {
    street: upper(street),
    city: upper(city),
    state,
    zip: upper(zip),
    latitude,
    longitude,
    formattedAddress: upper(result?.formatted_address ?? address),
  };
}

export const getCustomerProfile = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view your profile.");
    const { data } = await requireCustomer(request.auth.uid);
    return profileResponse(data);
  }
);

export const updateCustomerProfile = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to update your profile.");
    const { reference, data } = await requireCustomer(request.auth.uid);
    const input = isRecord(request.data) ? request.data : {};
    const displayName = text(input.displayName);
    const phone = text(input.phone);
    const language = supportedLanguages.has(text(input.language))
      ? text(input.language)
      : supportedLanguages.has(text(data.language)) ? text(data.language) : "English";

    if (!displayName || displayName.length > 80 || !phone || phone.length > 32) {
      throw new HttpsError("invalid-argument", "Enter a valid display name and phone number.");
    }

    await Promise.all([
      reference.update({ displayName, phone, language, updatedAt: FieldValue.serverTimestamp() }),
      admin.auth().updateUser(request.auth.uid, { displayName }),
    ]);

    return profileResponse({ ...data, displayName, phone, language });
  }
);

export const saveCustomerDefaultAddress = onCall(
  { region: "us-central1", secrets: [googleMapsApiKey] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to save your delivery address.");
    const { reference } = await requireCustomer(request.auth.uid);
    const address = await verifyAddress(isRecord(request.data) ? request.data : {});

    await Promise.all([
      reference.update({ defaultAddress: address, updatedAt: FieldValue.serverTimestamp() }),
      reference.collection("addresses").doc("default").set({
        ...address,
        isDefault: true,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true }),
    ]);

    return { defaultAddress: address };
  }
);

export const deleteCustomerDefaultAddress = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to delete your delivery address.");
    const { reference } = await requireCustomer(request.auth.uid);
    await Promise.all([
      reference.update({ defaultAddress: null, updatedAt: FieldValue.serverTimestamp() }),
      reference.collection("addresses").doc("default").delete(),
    ]);
    return { success: true };
  }
);

export const beginCustomerProfileImageUpload = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to upload a profile photo.");
    const { reference } = await requireCustomer(request.auth.uid);
    const input = isRecord(request.data) ? request.data : {};
    const contentType = text(input.contentType);
    const extension = text(input.extension).toLowerCase().replace(/[^a-z0-9]/g, "");
    const size = input.size;

    if (!supportedImageTypes.has(contentType) || !extension || extension.length > 10 ||
      typeof size !== "number" || !Number.isFinite(size) || size <= 0 || size > 10 * 1024 * 1024) {
      throw new HttpsError("invalid-argument", "Upload a JPG, PNG, WebP, or AVIF image up to 10 MB.");
    }

    const imageId = `${Date.now()}-${crypto.randomUUID()}`;
    const originalPath = `users/${request.auth.uid}/images/originals/profile/${imageId}.${extension}`;
    await reference.update({
      profileImageStatus: "processing",
      profileImageError: null,
      profileImageOriginalPath: originalPath,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { imageId, originalPath };
  }
);

export const deleteCustomerProfileData = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to delete your account data.");
    const { reference } = await requireCustomer(request.auth.uid);
    const addresses = await reference.collection("addresses").get();
    await admin.storage().bucket().deleteFiles({ prefix: `users/${request.auth.uid}/images/`, force: true });
    const batch = db.batch();
    addresses.docs.forEach((address) => batch.delete(address.ref));
    batch.delete(reference);
    await batch.commit();
    return { success: true };
  }
);

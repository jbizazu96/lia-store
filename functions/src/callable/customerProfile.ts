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
import {normalizeUsStateCode} from "../common/usStateCodes";
import {resolveDeliveryZoneForAddress, zoneFields} from "../delivery/deliveryZoneAssignmentService";
import {enforceCallableAbuseProtection} from "../security/callableAbuseProtection";

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
const maximumFavoriteStores = 100;
const defaultNotificationPreferences = {
  orderUpdates: true,
  promotions: true,
  storeUpdates: true,
  productUpdates: true,
  marketing: true,
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function upper(value: string): string {
  return value.trim().toUpperCase();
}

function stateCode(value: unknown): string | null {
  return normalizeUsStateCode(value);
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
  if (["deletion_pending", "deletion_processing"].includes(data.accountDeletionState)) {
    throw new HttpsError("permission-denied", "Your account deletion request is under review. Customer account access is unavailable.");
  }

  if (data.isActive === false) {
    throw new HttpsError(
      "permission-denied",
      "This customer account is currently suspended. Contact support for help."
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
    deliveryZones: {
      homeZone: text(data.homeZoneId)
        ? {id: text(data.homeZoneId), name: text(data.homeZoneName) || "Assigned delivery zone"}
        : null,
      orderZones: Array.isArray(data.orderZoneIds)
        ? data.orderZoneIds.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
          .map((id, index) => ({
            id: id.trim(),
            name: Array.isArray(data.orderZoneNames) && typeof data.orderZoneNames[index] === "string"
              ? data.orderZoneNames[index].trim() || "Approved Order Zone"
              : "Approved Order Zone",
          }))
        : [],
    },
    recentSearches: [...new Set(
      Array.isArray(data.recentSearches)
        ? data.recentSearches.filter((item): item is string =>
          typeof item === "string" && item.trim().length > 0 && item.trim().length <= 100
        ).map((item) => item.trim())
        : []
    )].slice(0, 10),
    notificationPreferences: notificationPreferences(data),
  };
}

function notificationPreferences(
  data: Record<string, unknown>,
) {
  const saved = isRecord(data.notificationPreferences)
    ? data.notificationPreferences
    : {};

  return {
    orderUpdates: saved.orderUpdates === false
      ? false
      : defaultNotificationPreferences.orderUpdates,
    promotions: saved.promotions === false
      ? false
      : defaultNotificationPreferences.promotions,
    storeUpdates: saved.storeUpdates === false
      ? false
      : defaultNotificationPreferences.storeUpdates,
    productUpdates: saved.productUpdates === false
      ? false
      : defaultNotificationPreferences.productUpdates,
    marketing: saved.marketing === false
      ? false
      : defaultNotificationPreferences.marketing,
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
      place_id?: string;
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
    placeId: result?.place_id ?? null,
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
    await enforceCallableAbuseProtection({operation: "customer-address-geocode", uid: request.auth.uid, appCheckVerified: Boolean(request.app), maximumRequests: 10, windowSeconds: 3_600});
    const { reference } = await requireCustomer(request.auth.uid);
    const address = await verifyAddress(isRecord(request.data) ? request.data : {});
    const zone = await resolveDeliveryZoneForAddress(address.city, address.state, address.zip, address.placeId);
    const zonedAddress = {...address, ...zoneFields(zone)};

    await Promise.all([
      reference.update({defaultAddress: zonedAddress, homeZoneId: zone?.id ?? null, homeZoneName: zone?.name ?? null, zoneAssignmentSource: "automatic", updatedAt: FieldValue.serverTimestamp()}),
      reference.collection("addresses").doc("default").set({
        ...zonedAddress,
        isDefault: true,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true }),
    ]);

    return { defaultAddress: zonedAddress };
  }
);

export const deleteCustomerDefaultAddress = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to delete your delivery address.");
    const { reference } = await requireCustomer(request.auth.uid);
    await Promise.all([
      reference.update({defaultAddress: null, homeZoneId: null, homeZoneName: null, updatedAt: FieldValue.serverTimestamp()}),
      reference.collection("addresses").doc("default").delete(),
    ]);
    return { success: true };
  }
);

export const saveCustomerRecentSearch = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to save a search.");
    const { reference, data } = await requireCustomer(request.auth.uid);
    const query = text(isRecord(request.data) ? request.data.query : "");

    if (!query || query.length > 100) {
      throw new HttpsError("invalid-argument", "Enter a valid search.");
    }

    const current = profileResponse(data).recentSearches;
    const recentSearches = [
      query,
      ...current.filter((item) => item.toLowerCase() !== query.toLowerCase()),
    ].slice(0, 10);

    await reference.update({
      recentSearches,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { recentSearches };
  },
);

export const updateCustomerNotificationPreferences = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in to update notification settings.",
      );
    }

    const { reference, data } = await requireCustomer(request.auth.uid);
    const input = isRecord(request.data) ? request.data : {};
    const current = notificationPreferences(data);
    const preferences = {
      orderUpdates: typeof input.orderUpdates === "boolean"
        ? input.orderUpdates
        : current.orderUpdates,
      promotions: typeof input.promotions === "boolean"
        ? input.promotions
        : current.promotions,
      storeUpdates: typeof input.storeUpdates === "boolean"
        ? input.storeUpdates
        : current.storeUpdates,
      productUpdates: typeof input.productUpdates === "boolean"
        ? input.productUpdates
        : current.productUpdates,
      marketing: typeof input.marketing === "boolean"
        ? input.marketing
        : current.marketing,
    };

    await reference.update({
      notificationPreferences: preferences,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { notificationPreferences: preferences };
  },
);

/*
|--------------------------------------------------------------------------
| Saved Stores
|--------------------------------------------------------------------------
|
| A customer may save only publicly visible stores. The browser never writes
| this list itself; the callable derives the customer from Firebase Auth and
| validates the requested store against the public catalog projection.
|
*/

function favoriteStoreIds(
  value: unknown
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value.filter((item): item is string =>
      typeof item === "string" &&
      /^[A-Za-z0-9_-]{1,128}$/.test(item)
    )
  )].slice(0, maximumFavoriteStores);
}

export const getCustomerFavoriteStores = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in to view your saved stores."
      );
    }

    const { data } = await requireCustomer(request.auth.uid);

    return {
      storeIds: favoriteStoreIds(data.favoriteStoreIds),
    };
  }
);

export const setCustomerStoreFavorite = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in to manage saved stores."
      );
    }

    const { reference, data } = await requireCustomer(request.auth.uid);
    const input = isRecord(request.data) ? request.data : {};
    const storeId = text(input.storeId);
    const shouldSave = input.isFavorite === true;

    if (!/^[A-Za-z0-9_-]{1,128}$/.test(storeId)) {
      throw new HttpsError(
        "invalid-argument",
        "A valid store is required."
      );
    }

    const currentStoreIds = favoriteStoreIds(data.favoriteStoreIds);

    if (shouldSave) {
      const storeProfile = await db
        .collection("storePublicProfiles")
        .doc(storeId)
        .get();

      if (!storeProfile.exists) {
        throw new HttpsError(
          "not-found",
          "This store is not currently available to save."
        );
      }

      if (!currentStoreIds.includes(storeId) &&
        currentStoreIds.length >= maximumFavoriteStores) {
        throw new HttpsError(
          "resource-exhausted",
          `You can save up to ${maximumFavoriteStores} stores.`
        );
      }
    }

    const storeIds = shouldSave
      ? [...new Set([...currentStoreIds, storeId])]
      : currentStoreIds.filter((id) => id !== storeId);

    await reference.update({
      favoriteStoreIds: storeIds,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { storeIds };
  }
);

export const beginCustomerProfileImageUpload = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to upload a profile photo.");
    await enforceCallableAbuseProtection({operation: "customer-profile-image-upload", uid: request.auth.uid, appCheckVerified: Boolean(request.app), maximumRequests: 20, windowSeconds: 3_600});
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

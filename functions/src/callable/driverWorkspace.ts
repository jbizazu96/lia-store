/*
|--------------------------------------------------------------------------
| Driver Workspace Callables
|--------------------------------------------------------------------------
|
| The driver browser never reads or writes protected driver records
| directly. These callables verify Firebase Authentication, confirm that the
| caller owns drivers/{uid}, and then use the Admin SDK in Cloud Functions.
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

/*
 * Callable modules can be evaluated before index.ts reaches its shared
 * initialization block during deployment analysis. Initialize defensively so
 * this module always has a default Admin app, without creating duplicates.
 */
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");
const googleMapsApiKey = defineSecret("GOOGLE_MAPS_API_KEY");
const MAXIMUM_PREFERRED_RADIUS_MILES = 50;

type DriverDocumentField =
  | "drivers-license-front"
  | "drivers-license-back"
  | "vehicle-insurance"
  | "vehicle-registration";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function iso(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date ? date.toISOString() : null;
  }
  return typeof value === "string" ? value : null;
}

function upper(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeState(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function isFutureDate(value: string): boolean {
  const date = new Date(value + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return !Number.isNaN(date.getTime()) && date > today;
}

function amount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function requireDriver(uid: string) {
  const [user, driver] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("drivers").doc(uid).get(),
  ]);

  if (user.data()?.accountType !== "driver" || !driver.exists || driver.data()?.ownerUid !== uid) {
    throw new HttpsError("permission-denied", "You do not have access to the driver workspace.");
  }

  return driver;
}

async function getPayments(uid: string) {
  /*
   * Marketplace settlement now records every recipient obligation in
   * paymentTransfers.  The old payouts collection is not part of the live
   * transfer flow, so reading it made the driver app show zero earnings.
   */
  const snapshot = await db.collection("paymentTransfers")
    .where("recipient.id", "==", uid)
    .where("recipient.type", "==", "driver")
    .orderBy("updatedAt", "desc")
    .limit(100)
    .get();
  return snapshot.docs.map((document) => {
    const data = document.data();
    const rawStatus = valueString(data.status);
    return {
      id: document.id,
      deliveryId: valueString(data.orderId) || document.id,
      /* Transfers store cents; the UI consistently displays dollars. */
      amount: amount(data.amount) / 100,
      status: rawStatus === "completed"
        ? "paid"
        : rawStatus === "failed"
          ? "failed"
          : "pending",
      paidAt: iso(data.completedAt),
      createdAt: iso(data.createdAt) ?? iso(data.updatedAt),
    };
  }).sort((left, right) => (right.paidAt ?? right.createdAt ?? "").localeCompare(left.paidAt ?? left.createdAt ?? ""));
}

function totalsFor(payments: Array<{ amount: number; status: string; paidAt: string | null; createdAt: string | null }>) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const week = new Date(today);
  week.setDate(today.getDate() - 6);
  const month = new Date(today.getFullYear(), today.getMonth(), 1);
  const paid = payments.filter((payment) => payment.status === "paid");
  const totalAfter = (after: Date) => paid.filter((payment) => new Date(payment.paidAt ?? payment.createdAt ?? 0) >= after).reduce((sum, payment) => sum + payment.amount, 0);

  return {
    today: totalAfter(today),
    week: totalAfter(week),
    month: totalAfter(month),
    lifetime: paid.reduce((sum, payment) => sum + payment.amount, 0),
    pending: payments.filter((payment) => payment.status === "pending").reduce((sum, payment) => sum + payment.amount, 0),
    paid: paid.reduce((sum, payment) => sum + payment.amount, 0),
  };
}

function documentStatus(label: string, value: unknown) {
  const data = isRecord(value) ? value : {};
  const status = valueString(data.reviewStatus);
  return {
    label,
    reviewStatus: status === "pending" || status === "approved" || status === "rejected" || status === "expired" ? status : "missing",
    expirationDate: valueString(data.expirationDate) || undefined,
  };
}

async function getSummary(uid: string) {
  const [driver, payments] = await Promise.all([requireDriver(uid), getPayments(uid)]);
  const data = driver.data() ?? {};
  const address = isRecord(data.address) ? data.address : {};
  const serviceArea = isRecord(data.serviceArea) ? data.serviceArea : {};
  const vehicle = isRecord(data.vehicle) ? data.vehicle : {};
  const rawStatus = valueString(data.status);

  return {
    firstName: valueString(data.firstName) || "Driver",
    profile: {
      firstName: valueString(data.firstName),
      middleName: valueString(data.middleName),
      lastName: valueString(data.lastName),
      email: valueString(data.email),
      phone: valueString(data.phone),
      dateOfBirth: valueString(data.dateOfBirth),
      address: { street: valueString(address.street), apartment: valueString(address.apartment), city: valueString(address.city), state: valueString(address.state), zip: valueString(address.zip), formattedAddress: valueString(address.formattedAddress) },
      serviceArea: { city: valueString(serviceArea.city), state: valueString(serviceArea.state), preferredRadiusMiles: typeof serviceArea.preferredRadiusMiles === "number" ? serviceArea.preferredRadiusMiles : null, approvedRadiusMiles: typeof serviceArea.approvedRadiusMiles === "number" ? serviceArea.approvedRadiusMiles : null },
      vehicle: { make: valueString(vehicle.make), model: valueString(vehicle.model), year: typeof vehicle.year === "number" ? vehicle.year : null, color: valueString(vehicle.color), licensePlate: valueString(vehicle.licensePlate), registrationState: valueString(vehicle.registrationState) },
    },
    onboardingCompleted: data.onboardingCompleted === true,
    onboardingStep: valueString(data.onboardingStep) || "personal-information",
    status: rawStatus === "approved" || rawStatus === "suspended" || rawStatus === "rejected" || rawStatus === "pending_review" ? rawStatus : "draft",
    isApproved: data.isApproved === true,
    stripe: { status: valueString(data.stripeAccountStatus) || "not_started", transfersEnabled: data.stripeTransfersEnabled === true, payoutsEnabled: data.stripePayoutsEnabled === true, requiresAction: data.stripeRequiresAction === true },
    documents: [documentStatus("Driver license", data.driversLicense), documentStatus("Vehicle insurance", data.vehicleInsurance), documentStatus("Vehicle registration", data.vehicleRegistration)],
    lastPayment: payments.find((payment) => payment.status === "paid") ?? null,
    totals: totalsFor(payments),
  };
}

async function geocodeAddress(address: string): Promise<{ formattedAddress: string; latitude: number; longitude: number } | null> {
  const response = await fetch("https://maps.googleapis.com/maps/api/geocode/json?address=" + encodeURIComponent(address) + "&key=" + encodeURIComponent(googleMapsApiKey.value()));
  if (!response.ok) return null;
  const body = await response.json() as {
    status?: unknown;
    results?: Array<{
      formatted_address?: unknown;
      geometry?: {
        location?: {
          lat?: unknown;
          lng?: unknown;
        };
      };
    }>;
  };
  const result = body.status === "OK" ? body.results?.[0] : null;
  const latitude = result?.geometry?.location?.lat;
  const longitude = result?.geometry?.location?.lng;
  return typeof latitude === "number" && typeof longitude === "number" ? { formattedAddress: valueString(result?.formatted_address) || address, latitude, longitude } : null;
}

export const getDriverWorkspaceEntry = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to open the driver app.");
  const [user, driver] = await Promise.all([db.collection("users").doc(request.auth.uid).get(), db.collection("drivers").doc(request.auth.uid).get()]);
  if (user.data()?.accountType !== "driver") throw new HttpsError("permission-denied", "You do not have access to the driver app.");
  if (!driver.exists || driver.data()?.ownerUid !== request.auth.uid) return { hasApplication: false, onboardingCompleted: false, onboardingStep: "personal-information", isApproved: false };
  const data = driver.data() ?? {};
  return { hasApplication: true, onboardingCompleted: data.onboardingCompleted === true, onboardingStep: valueString(data.onboardingStep) || "personal-information", isApproved: data.isApproved === true };
});

export const getDriverWorkspaceSummary = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to open the driver workspace.");
  return getSummary(request.auth.uid);
});

export const getDriverWorkspacePayments = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view payments.");
  await requireDriver(request.auth.uid);
  const payments = await getPayments(request.auth.uid);
  return { payments, totals: totalsFor(payments) };
});

export const getDriverWorkspaceNotifications = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to view notifications.");
  await requireDriver(request.auth.uid);
  const snapshot = await db.collection("users").doc(request.auth.uid).collection("notifications").orderBy("createdAt", "desc").limit(50).get();
  return { notifications: snapshot.docs.map((document) => { const data = document.data(); return { id: document.id, title: valueString(data.title) || "Driver update", body: valueString(data.body) || "You have a new driver account update.", type: valueString(data.type) || "system", read: data.read === true, createdAt: iso(data.createdAt), deepLink: valueString(data.deepLink) || undefined }; }) };
});

export const markDriverWorkspaceNotificationRead = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to update notifications.");
  const notificationId = valueString(isRecord(request.data) ? request.data.notificationId : "");
  if (!notificationId || notificationId.includes("/")) throw new HttpsError("invalid-argument", "A valid notification is required.");
  await requireDriver(request.auth.uid);
  await db.collection("users").doc(request.auth.uid).collection("notifications").doc(notificationId).update({ read: true, updatedAt: FieldValue.serverTimestamp() });
  return { success: true };
});

export const clearDriverWorkspaceNotifications = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to update notifications.");
  await requireDriver(request.auth.uid);
  const snapshot = await db.collection("users").doc(request.auth.uid).collection("notifications").get();
  const batch = db.batch();
  snapshot.docs.forEach((document) => batch.delete(document.ref));
  await batch.commit();
  return { success: true };
});

export const submitDriverDocumentReplacement = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to update documents.");
  const input = isRecord(request.data) ? request.data : {};
  const field = valueString(input.field) as DriverDocumentField;
  const expirationDate = valueString(input.expirationDate);
  const allowed = ["drivers-license-front", "drivers-license-back", "vehicle-insurance", "vehicle-registration"];
  if (!allowed.includes(field) || !isFutureDate(expirationDate)) throw new HttpsError("invalid-argument", "Enter a valid future expiration date.");
  const driver = await requireDriver(request.auth.uid);
  const key = field.startsWith("drivers-license") ? "driversLicense" : field === "vehicle-insurance" ? "vehicleInsurance" : "vehicleRegistration";
  const issuingState = field.startsWith("drivers-license") ? normalizeState(valueString(input.issuingState)) : null;
  if (field.startsWith("drivers-license") && !issuingState) throw new HttpsError("invalid-argument", "Enter the license issuing state.");
  const previous = isRecord(driver.data()?.[key]) ? driver.data()?.[key] as Record<string, unknown> : {};
  await driver.ref.update({
    ...(key === "driversLicense" ? { "driversLicense.issuingState": issuingState } : {}),
    ...(key === "vehicleInsurance" ? { "vehicleInsurance.provider": valueString(input.provider) || null } : {}),
    [key + ".expirationDate"]: expirationDate,
    [key + ".reviewStatus"]: "pending",
    [key + ".rejectionReason"]: null,
    [key + ".reviewedAt"]: null,
    [key + ".reviewedBy"]: null,
    [key + ".submissionVersion"]: typeof previous.submissionVersion === "number" ? previous.submissionVersion + 1 : 1,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { success: true };
});

export const updateDriverWorkspaceProfile = onCall({ region: "us-central1", secrets: [googleMapsApiKey] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to update your profile.");
  const input = isRecord(request.data) && isRecord(request.data.profile) ? request.data.profile : {};
  const address = isRecord(input.address) ? input.address : {};
  const serviceArea = isRecord(input.serviceArea) ? input.serviceArea : {};
  const vehicle = isRecord(input.vehicle) ? input.vehicle : {};
  const firstName = valueString(input.firstName).trim();
  const middleName = valueString(input.middleName).trim();
  const lastName = valueString(input.lastName).trim();
  const phone = valueString(input.phone).trim();
  const addressState = normalizeState(valueString(address.state));
  const serviceAreaState = normalizeState(valueString(serviceArea.state));
  const registrationState = normalizeState(valueString(vehicle.registrationState));
  const radius = typeof serviceArea.preferredRadiusMiles === "number" ? serviceArea.preferredRadiusMiles : null;
  const year = typeof vehicle.year === "number" ? vehicle.year : null;
  const currentYear = new Date().getFullYear() + 1;
  if (!firstName || !lastName || !/^\(\d{3}\) \d{3} - \d{4}$/.test(phone) || !valueString(address.street).trim() || !valueString(address.city).trim() || !addressState || !valueString(address.zip).trim() || !valueString(serviceArea.city).trim() || !serviceAreaState || !radius || radius <= 0 || radius > MAXIMUM_PREFERRED_RADIUS_MILES || !valueString(vehicle.make).trim() || !valueString(vehicle.model).trim() || !year || year < 1900 || year > currentYear || !valueString(vehicle.color).trim() || !valueString(vehicle.licensePlate).trim() || !registrationState) throw new HttpsError("invalid-argument", "Complete your profile, address, service area, and vehicle information using valid values.");
  const rawAddress = valueString(address.street) + (valueString(address.apartment).trim() ? ", " + valueString(address.apartment) : "") + ", " + valueString(address.city) + ", " + addressState + " " + valueString(address.zip);
  const location = await geocodeAddress(rawAddress);
  if (!location) throw new HttpsError("invalid-argument", "We could not verify your home address. Check the street, city, state, and ZIP code.");
  const driver = await requireDriver(request.auth.uid);
  const existingVehicle = isRecord(driver.data()?.vehicle) ? driver.data()?.vehicle as Record<string, unknown> : {};
  const vehicleRequiresReview = existingVehicle.make !== valueString(vehicle.make).trim() || existingVehicle.model !== valueString(vehicle.model).trim() || existingVehicle.year !== year || existingVehicle.licensePlate !== upper(valueString(vehicle.licensePlate)) || existingVehicle.registrationState !== registrationState;
  const existingArea = isRecord(driver.data()?.serviceArea) ? driver.data()?.serviceArea as Record<string, unknown> : {};
  await Promise.all([
    driver.ref.update({
      firstName, middleName: middleName || null, lastName, phone,
      address: { street: upper(valueString(address.street)), apartment: upper(valueString(address.apartment)) || null, city: upper(valueString(address.city)), state: addressState, zip: upper(valueString(address.zip)), formattedAddress: upper(location.formattedAddress), latitude: location.latitude, longitude: location.longitude },
      serviceArea: { city: upper(valueString(serviceArea.city)), state: serviceAreaState, preferredRadiusMiles: radius, approvedRadiusMiles: typeof existingArea.approvedRadiusMiles === "number" ? existingArea.approvedRadiusMiles : null },
      vehicle: { make: valueString(vehicle.make).trim(), model: valueString(vehicle.model).trim(), year, color: valueString(vehicle.color).trim(), licensePlate: upper(valueString(vehicle.licensePlate)), registrationState },
      ...(vehicleRequiresReview ? { "vehicleInsurance.reviewStatus": "pending", "vehicleInsurance.rejectionReason": null, "vehicleInsurance.reviewedAt": null, "vehicleInsurance.reviewedBy": null, "vehicleRegistration.reviewStatus": "pending", "vehicleRegistration.rejectionReason": null, "vehicleRegistration.reviewedAt": null, "vehicleRegistration.reviewedBy": null } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }),
    db.collection("users").doc(request.auth.uid).update({ displayName: firstName + " " + lastName, phone, updatedAt: FieldValue.serverTimestamp() }),
  ]);
  return getSummary(request.auth.uid);
});

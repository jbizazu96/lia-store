/*
|--------------------------------------------------------------------------
| Server Driver Workspace Service
|--------------------------------------------------------------------------
|
| All driver-app reads and document-review writes pass through this service.
| The browser never receives another driver's data or performs Firestore
| operations directly.
|
*/

import "server-only";

import {
  FieldValue,
} from "firebase-admin/firestore";
import {
  getFirebaseAdminFirestore,
} from "@/lib/firebaseAdmin";
import { geocodeAddress } from "@/services/delivery/geocode";
import { normalizeUsState } from "@/utils/usState";
import { DRIVER_CONFIG } from "@/config/driver";
import type {
  DriverDocumentStatus,
  DriverNotification,
  DriverPayment,
  DriverPaymentTotals,
  DriverWorkspaceSummary,
  DriverWorkspaceStatus,
} from "@/types/driverWorkspace";

function iso(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date ? date.toISOString() : null;
  }

  return typeof value === "string" ? value : null;
}

function amount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function upper(value: string): string {
  return value.trim().toUpperCase();
}

function isFutureDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return !Number.isNaN(date.getTime()) && date > today;
}

function documentStatus(label: string, data: Record<string, unknown> | undefined): DriverDocumentStatus {
  const reviewStatus = data?.reviewStatus;
  const validStatus = reviewStatus === "pending" || reviewStatus === "approved" || reviewStatus === "rejected" || reviewStatus === "expired";

  return {
    label,
    reviewStatus: validStatus ? reviewStatus : "missing",
    expirationDate: typeof data?.expirationDate === "string" ? data.expirationDate : undefined,
  };
}

function startOfToday(): Date {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
}

function totalsFor(payments: DriverPayment[]): DriverPaymentTotals {
  const today = startOfToday();
  const week = new Date(today);
  week.setDate(today.getDate() - 6);
  const month = new Date(today.getFullYear(), today.getMonth(), 1);
  const paid = payments.filter((payment) => payment.status === "paid");
  const inRange = (payment: DriverPayment, after: Date) => {
    const date = payment.paidAt ?? payment.createdAt;
    return date ? new Date(date) >= after : false;
  };

  return {
    today: paid.filter((payment) => inRange(payment, today)).reduce((sum, payment) => sum + payment.amount, 0),
    week: paid.filter((payment) => inRange(payment, week)).reduce((sum, payment) => sum + payment.amount, 0),
    month: paid.filter((payment) => inRange(payment, month)).reduce((sum, payment) => sum + payment.amount, 0),
    lifetime: paid.reduce((sum, payment) => sum + payment.amount, 0),
    pending: payments.filter((payment) => payment.status === "pending").reduce((sum, payment) => sum + payment.amount, 0),
    paid: paid.reduce((sum, payment) => sum + payment.amount, 0),
  };
}

async function requireDriver(uid: string) {
  const database = getFirebaseAdminFirestore();
  const [user, driver] = await Promise.all([
    database.collection("users").doc(uid).get(),
    database.collection("drivers").doc(uid).get(),
  ]);

  if (user.data()?.accountType !== "driver" || !driver.exists || driver.data()?.ownerUid !== uid) {
    throw new Error("DRIVER_FORBIDDEN");
  }

  return driver;
}

async function getPayments(uid: string): Promise<DriverPayment[]> {
  const database = getFirebaseAdminFirestore();
  const snapshot = await database.collection("payouts").where("driverId", "==", uid).get();

  return snapshot.docs.map((document) => {
    const data = document.data();
    const rawStatus = data.status;
    const status = rawStatus === "paid" || rawStatus === "failed" ? rawStatus : "pending";

    return {
      id: document.id,
      deliveryId: typeof data.deliveryId === "string" ? data.deliveryId : typeof data.orderId === "string" ? data.orderId : document.id,
      amount: amount(data.amount ?? data.driverAmount),
      status,
      paidAt: iso(data.paidAt),
      createdAt: iso(data.createdAt),
    };
  }).sort((left, right) => (right.paidAt ?? right.createdAt ?? "").localeCompare(left.paidAt ?? left.createdAt ?? ""));
}

export const serverDriverWorkspaceService = {
  async getEntry(uid: string) {
    const database = getFirebaseAdminFirestore();
    const [user, driver] = await Promise.all([
      database.collection("users").doc(uid).get(),
      database.collection("drivers").doc(uid).get(),
    ]);

    if (user.data()?.accountType !== "driver") {
      throw new Error("DRIVER_FORBIDDEN");
    }

    if (!driver.exists || driver.data()?.ownerUid !== uid) {
      return { hasApplication: false, onboardingCompleted: false, onboardingStep: "personal-information", isApproved: false };
    }

    const data = driver.data() ?? {};
    return {
      hasApplication: true,
      onboardingCompleted: data.onboardingCompleted === true,
      onboardingStep: typeof data.onboardingStep === "string" ? data.onboardingStep : "personal-information",
      isApproved: data.isApproved === true,
    };
  },

  async getSummary(uid: string): Promise<DriverWorkspaceSummary> {
    const [driver, payments] = await Promise.all([requireDriver(uid), getPayments(uid)]);
    const data = driver.data() ?? {};
    const status = data.status === "approved" || data.status === "suspended" || data.status === "rejected" || data.status === "pending_review"
      ? data.status
      : "draft";

    return {
      firstName: typeof data.firstName === "string" ? data.firstName : "Driver",
      profile: {
        firstName: typeof data.firstName === "string" ? data.firstName : "",
        middleName: typeof data.middleName === "string" ? data.middleName : "",
        lastName: typeof data.lastName === "string" ? data.lastName : "",
        email: typeof data.email === "string" ? data.email : "",
        phone: typeof data.phone === "string" ? data.phone : "",
        dateOfBirth: typeof data.dateOfBirth === "string" ? data.dateOfBirth : "",
        address: {
          street: typeof data.address?.street === "string" ? data.address.street : "",
          apartment: typeof data.address?.apartment === "string" ? data.address.apartment : "",
          city: typeof data.address?.city === "string" ? data.address.city : "",
          state: typeof data.address?.state === "string" ? data.address.state : "",
          zip: typeof data.address?.zip === "string" ? data.address.zip : "",
          formattedAddress: typeof data.address?.formattedAddress === "string" ? data.address.formattedAddress : "",
        },
        serviceArea: {
          city: typeof data.serviceArea?.city === "string" ? data.serviceArea.city : "",
          state: typeof data.serviceArea?.state === "string" ? data.serviceArea.state : "",
          preferredRadiusMiles: typeof data.serviceArea?.preferredRadiusMiles === "number" ? data.serviceArea.preferredRadiusMiles : null,
          approvedRadiusMiles: typeof data.serviceArea?.approvedRadiusMiles === "number" ? data.serviceArea.approvedRadiusMiles : null,
        },
        vehicle: {
          make: typeof data.vehicle?.make === "string" ? data.vehicle.make : "",
          model: typeof data.vehicle?.model === "string" ? data.vehicle.model : "",
          year: typeof data.vehicle?.year === "number" ? data.vehicle.year : null,
          color: typeof data.vehicle?.color === "string" ? data.vehicle.color : "",
          licensePlate: typeof data.vehicle?.licensePlate === "string" ? data.vehicle.licensePlate : "",
          registrationState: typeof data.vehicle?.registrationState === "string" ? data.vehicle.registrationState : "",
        },
      },
      onboardingCompleted: data.onboardingCompleted === true,
      onboardingStep: typeof data.onboardingStep === "string" ? data.onboardingStep : "personal-information",
      status: status as DriverWorkspaceStatus,
      isApproved: data.isApproved === true,
      stripe: {
        status: typeof data.stripeAccountStatus === "string" ? data.stripeAccountStatus : "not_started",
        transfersEnabled: data.stripeTransfersEnabled === true,
        payoutsEnabled: data.stripePayoutsEnabled === true,
        requiresAction: data.stripeRequiresAction === true,
      },
      documents: [
        documentStatus("Driver license", data.driversLicense),
        documentStatus("Vehicle insurance", data.vehicleInsurance),
        documentStatus("Vehicle registration", data.vehicleRegistration),
      ],
      lastPayment: payments.find((payment) => payment.status === "paid") ?? null,
      totals: totalsFor(payments),
    };
  },

  async getPayments(uid: string) {
    await requireDriver(uid);
    const payments = await getPayments(uid);
    return { payments, totals: totalsFor(payments) };
  },

  async getNotifications(uid: string): Promise<DriverNotification[]> {
    await requireDriver(uid);
    const snapshot = await getFirebaseAdminFirestore()
      .collection("users").doc(uid).collection("notifications")
      .orderBy("createdAt", "desc").limit(50).get();

    return snapshot.docs.map((document) => {
      const data = document.data();
      return {
        id: document.id,
        title: typeof data.title === "string" ? data.title : "Driver update",
        body: typeof data.body === "string" ? data.body : "You have a new driver account update.",
        type: typeof data.type === "string" ? data.type : "system",
        read: data.read === true,
        createdAt: iso(data.createdAt),
        deepLink: typeof data.deepLink === "string" ? data.deepLink : undefined,
      };
    });
  },

  async markNotificationRead(uid: string, notificationId: string) {
    await requireDriver(uid);
    await getFirebaseAdminFirestore().collection("users").doc(uid)
      .collection("notifications").doc(notificationId).update({ read: true, updatedAt: FieldValue.serverTimestamp() });
  },

  async clearNotifications(uid: string) {
    await requireDriver(uid);
    const database = getFirebaseAdminFirestore();
    const snapshot = await database.collection("users").doc(uid).collection("notifications").get();
    const batch = database.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
  },

  async submitDocumentReplacement(uid: string, input: { field: "drivers-license-front" | "drivers-license-back" | "vehicle-insurance" | "vehicle-registration"; expirationDate: string; issuingState?: string; provider?: string }) {
    const driver = await requireDriver(uid);
    const data = driver.data() ?? {};
    const documentKey = input.field.startsWith("drivers-license") ? "driversLicense" : input.field === "vehicle-insurance" ? "vehicleInsurance" : "vehicleRegistration";
    const previous = data[documentKey] as Record<string, unknown> | undefined;
    const issuingState = input.field.startsWith("drivers-license") ? normalizeUsState(input.issuingState ?? "") : null;

    if (!isFutureDate(input.expirationDate) || (input.field.startsWith("drivers-license") && !issuingState)) {
      throw new Error("INVALID_DOCUMENT");
    }

    await driver.ref.update({
      ...(documentKey === "driversLicense" ? { "driversLicense.issuingState": issuingState } : {}),
      ...(documentKey === "vehicleInsurance" ? { "vehicleInsurance.provider": input.provider?.trim() || null } : {}),
      [`${documentKey}.expirationDate`]: input.expirationDate,
      [`${documentKey}.reviewStatus`]: "pending",
      [`${documentKey}.rejectionReason`]: null,
      [`${documentKey}.reviewedAt`]: null,
      [`${documentKey}.reviewedBy`]: null,
      [`${documentKey}.submissionVersion`]: typeof previous?.submissionVersion === "number" ? previous.submissionVersion + 1 : 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
  },

  async updateProfile(uid: string, input: DriverWorkspaceSummary["profile"]) {
    const driver = await requireDriver(uid);
    const firstName = input.firstName.trim(); const middleName = input.middleName.trim(); const lastName = input.lastName.trim(); const phone = input.phone.trim();
    const addressState = normalizeUsState(input.address.state);
    const serviceAreaState = normalizeUsState(input.serviceArea.state);
    const registrationState = normalizeUsState(input.vehicle.registrationState);
    const currentYear = new Date().getFullYear() + 1;
    const radius = input.serviceArea.preferredRadiusMiles;
    const existingVehicle = driver.data()?.vehicle as Record<string, unknown> | undefined;
    const vehicleRequiresReview =
      existingVehicle?.make !== input.vehicle.make.trim() ||
      existingVehicle?.model !== input.vehicle.model.trim() ||
      existingVehicle?.year !== Number(input.vehicle.year) ||
      existingVehicle?.licensePlate !== upper(input.vehicle.licensePlate) ||
      existingVehicle?.registrationState !== registrationState;

    if (!firstName || !lastName || !/^\(\d{3}\) \d{3} - \d{4}$/.test(phone) || !input.address.street.trim() || !input.address.city.trim() || !addressState || !input.address.zip.trim() || !input.serviceArea.city.trim() || !serviceAreaState || !radius || radius <= 0 || radius > DRIVER_CONFIG.MAXIMUM_PREFERRED_RADIUS_MILES || !input.vehicle.make.trim() || !input.vehicle.model.trim() || !input.vehicle.year || input.vehicle.year < 1900 || input.vehicle.year > currentYear || !input.vehicle.color.trim() || !input.vehicle.licensePlate.trim() || !registrationState) throw new Error("INVALID_PROFILE");

    const rawAddress = `${input.address.street}${input.address.apartment.trim() ? `, ${input.address.apartment}` : ""}, ${input.address.city}, ${addressState} ${input.address.zip}`;
    const location = await geocodeAddress(rawAddress);
    if (!location) throw new Error("ADDRESS_NOT_FOUND");

    const database = getFirebaseAdminFirestore();
    await Promise.all([
      driver.ref.update({
        firstName, middleName: middleName || null, lastName, phone,
        address: { street: upper(input.address.street), apartment: upper(input.address.apartment) || null, city: upper(input.address.city), state: addressState, zip: upper(input.address.zip), formattedAddress: (location.formattedAddress || rawAddress).toUpperCase(), latitude: location.latitude, longitude: location.longitude },
        serviceArea: { city: upper(input.serviceArea.city), state: serviceAreaState, preferredRadiusMiles: Number(radius), approvedRadiusMiles: typeof (driver.data()?.serviceArea as Record<string, unknown> | undefined)?.approvedRadiusMiles === "number" ? (driver.data()?.serviceArea as Record<string, unknown>).approvedRadiusMiles : null },
        vehicle: { make: input.vehicle.make.trim(), model: input.vehicle.model.trim(), year: Number(input.vehicle.year), color: input.vehicle.color.trim(), licensePlate: upper(input.vehicle.licensePlate), registrationState },
        /*
         * A material vehicle change can make the existing registration and
         * insurance evidence inaccurate. Keep the files, but require a new
         * administrator review before the driver can rely on that approval.
         */
        ...(vehicleRequiresReview ? {
          "vehicleInsurance.reviewStatus": "pending",
          "vehicleInsurance.rejectionReason": null,
          "vehicleInsurance.reviewedAt": null,
          "vehicleInsurance.reviewedBy": null,
          "vehicleRegistration.reviewStatus": "pending",
          "vehicleRegistration.rejectionReason": null,
          "vehicleRegistration.reviewedAt": null,
          "vehicleRegistration.reviewedBy": null,
        } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      }),
      database.collection("users").doc(uid).update({ displayName: `${firstName} ${lastName}`, phone, updatedAt: FieldValue.serverTimestamp() }),
    ]);
    return this.getSummary(uid);
  },
};

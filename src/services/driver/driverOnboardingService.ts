/*
|--------------------------------------------------------------------------
| Driver Onboarding Service
|--------------------------------------------------------------------------
|
| Owns validation, geocoding, document persistence, and image upload for
| the driver application. Onboarding UI components never write Firestore or
| Storage directly.
|
*/

import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import {
  DRIVER_CONFIG,
} from "@/config/driver";
import {
  DRIVER_LEGAL_CONFIG,
} from "@/config/driverLegal";
import {
  auth,
  db,
} from "@/lib/firebase";
import {
  mapDriverOnboardingDraft,
} from "@/mappers/driverOnboardingMapper";
import {
  geocodeAddress,
} from "@/services/delivery/geocode";
import {
  normalizeUsState,
} from "@/utils/usState";
import {
  driverImageService,
  type DriverImageField,
} from "./driverImageService";
import type {
  DeliveryMethod,
  DriverAddress,
  DriverOnboardingDraft,
  DriverOnboardingStep,
  DriverVehicle,
} from "@/types/driverOnboarding";

const upper = (value: string) => value.trim().toUpperCase();

function isFutureDate(value: string): boolean {
  return Boolean(value) && new Date(`${value}T23:59:59`).getTime() > Date.now();
}

function calculateAge(dateOfBirth: string): number {
  const birthDate = new Date(`${dateOfBirth}T00:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDifference = today.getMonth() - birthDate.getMonth();

  if (
    monthDifference < 0 ||
    (monthDifference === 0 && today.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return age;
}

function pendingDocumentReview() {
  return {
    reviewStatus: "pending" as const,
    rejectionReason: null,
    reviewedAt: null,
    reviewedBy: null,
  };
}

function preserveDocumentReview(
  review: Pick<
    DriverOnboardingDraft["driversLicense"],
    "reviewStatus" | "rejectionReason" | "reviewedAt" | "reviewedBy"
  >
) {
  return {
    reviewStatus: review.reviewStatus,
    rejectionReason: review.rejectionReason,
    reviewedAt: review.reviewedAt,
    reviewedBy: review.reviewedBy,
  };
}

/*
|--------------------------------------------------------------------------
| Driver Application Completion Validation
|--------------------------------------------------------------------------
|
| Keep final submission requirements in one place. This prevents a driver
| from completing onboarding by visiting the final route before earlier
| required steps have been finished.
|
*/
function requireCompleteDriverApplication(
  draft: DriverOnboardingDraft
): void {
  const missingSections: string[] = [];
  const birthDate = new Date(`${draft.dateOfBirth}T00:00:00`);
  const hasValidDateOfBirth =
    !Number.isNaN(birthDate.getTime()) &&
    birthDate < new Date() &&
    calculateAge(draft.dateOfBirth) >= DRIVER_CONFIG.MINIMUM_AGE;

  if (
    !draft.firstName ||
    !draft.lastName ||
    !draft.phone ||
    !draft.email ||
    !hasValidDateOfBirth
  ) {
    missingSections.push("personal information");
  }

  if (
    !draft.address.street ||
    !draft.address.city ||
    !draft.address.state ||
    !draft.address.zip ||
    !draft.address.formattedAddress ||
    !Number.isFinite(draft.address.latitude) ||
    !Number.isFinite(draft.address.longitude)
  ) {
    missingSections.push("verified home address");
  }

  if (
    !draft.serviceArea.city ||
    !draft.serviceArea.state ||
    !Number.isFinite(draft.serviceArea.preferredRadiusMiles) ||
    Number(draft.serviceArea.preferredRadiusMiles) <= 0 ||
    Number(draft.serviceArea.preferredRadiusMiles) >
      DRIVER_CONFIG.MAXIMUM_PREFERRED_RADIUS_MILES
  ) {
    missingSections.push("service area");
  }

  if (
    !draft.deliveryMethod ||
    !draft.vehicle.make ||
    !draft.vehicle.model ||
    !Number.isFinite(draft.vehicle.year) ||
    !draft.vehicle.color ||
    !draft.vehicle.licensePlate ||
    !draft.vehicle.registrationState
  ) {
    missingSections.push("vehicle information");
  }

  if (
    !draft.driversLicense.frontDocumentUrl ||
    !draft.driversLicense.backDocumentUrl ||
    !draft.driversLicense.issuingState ||
    !isFutureDate(draft.driversLicense.expirationDate)
  ) {
    missingSections.push("driver's license");
  }

  if (
    !draft.vehicleInsurance.documentUrl ||
    !isFutureDate(draft.vehicleInsurance.expirationDate)
  ) {
    missingSections.push("vehicle insurance");
  }

  if (
    !draft.vehicleRegistration.documentUrl ||
    !isFutureDate(draft.vehicleRegistration.expirationDate)
  ) {
    missingSections.push("vehicle registration");
  }

  if (
    !draft.agreements.terms.accepted ||
    draft.agreements.terms.version !== DRIVER_LEGAL_CONFIG.TERMS_VERSION ||
    !draft.agreements.privacyPolicy.accepted ||
    draft.agreements.privacyPolicy.version !==
      DRIVER_LEGAL_CONFIG.PRIVACY_POLICY_VERSION ||
    !draft.agreements.driverAgreement.accepted ||
    draft.agreements.driverAgreement.version !==
      DRIVER_LEGAL_CONFIG.DRIVER_AGREEMENT_VERSION ||
    !draft.agreements.informationCertifiedAccurate
  ) {
    missingSections.push("required agreements");
  }

  if (
    !draft.stripeAccountId ||
    !draft.stripeDetailsSubmitted ||
    !draft.stripeTransfersEnabled
  ) {
    missingSections.push("Stripe payout setup");
  }

  if (missingSections.length > 0) {
    throw new Error(
      `Complete the following before submitting your application: ${missingSections.join(
        ", "
      )}.`
    );
  }
}

/* Browser-side defense in depth; Firestore rules independently enforce this. */
function requireOwnedDriverId(driverId: string): string {
  const normalizedDriverId = driverId.trim();
  const currentUser = auth.currentUser;

  if (!currentUser || currentUser.uid !== normalizedDriverId) {
    throw new Error("You are not authorized to update this driver application.");
  }

  return normalizedDriverId;
}

function driverReference(driverId: string) {
  return doc(db, "drivers", requireOwnedDriverId(driverId));
}

function driverUserReference(driverId: string) {
  return doc(db, "users", requireOwnedDriverId(driverId));
}

export const driverOnboardingService = {
  async getDraft(driverId: string): Promise<DriverOnboardingDraft> {
    const snapshot = await getDoc(driverReference(driverId));

    return mapDriverOnboardingDraft(
      driverId,
      snapshot.exists() ? snapshot.data() : undefined
    );
  },

  async savePersonalInformation(
    driverId: string,
    input: {
      firstName: string;
      middleName: string;
      lastName: string;
      phone: string;
      email: string;
      dateOfBirth: string;
      profilePhoto: File | null;
    }
  ): Promise<DriverOnboardingDraft> {
    if (!input.firstName.trim() || !input.lastName.trim() || !input.phone.trim() || !input.email.trim() || !input.dateOfBirth) {
      throw new Error("Complete every required personal information field.");
    }

    const ageDate = new Date(`${input.dateOfBirth}T00:00:00`);
    if (
      Number.isNaN(ageDate.getTime()) ||
      ageDate >= new Date() ||
      calculateAge(input.dateOfBirth) < DRIVER_CONFIG.MINIMUM_AGE
    ) {
      throw new Error(
        `Drivers must be at least ${DRIVER_CONFIG.MINIMUM_AGE} years old.`
      );
    }

    const existing = await getDoc(driverReference(driverId));

    await setDoc(driverReference(driverId), {
      ownerUid: driverId,
      firstName: input.firstName.trim(),
      middleName: input.middleName.trim() || null,
      lastName: input.lastName.trim(),
      phone: input.phone.trim(),
      email: input.email.trim(),
      dateOfBirth: input.dateOfBirth,
      isApproved: existing.data()?.isApproved === true,
      onboardingCompleted: false,
      onboardingStep: "address-service-area",
      createdAt: existing.data()?.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    if (input.profilePhoto) {
      await driverImageService.uploadOriginalImage({
        driverId,
        field: "profile-photo",
        file: input.profilePhoto,
      });
    }

    await setDoc(driverUserReference(driverId), {
      displayName: `${input.firstName.trim()} ${input.lastName.trim()}`,
      email: input.email.trim(),
      phone: input.phone.trim(),
      driverId,
      onboardingCompleted: false,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    return this.getDraft(driverId);
  },

  async saveAddressAndServiceArea(
    driverId: string,
    input: {
      address: Omit<DriverAddress, "formattedAddress" | "latitude" | "longitude">;
      serviceArea: {
        city: string;
        state: string;
        preferredRadiusMiles: number | null;
      };
    }
  ): Promise<DriverOnboardingDraft> {
    const { address, serviceArea } = input;
    const draft = await this.getDraft(driverId);
    const addressState = normalizeUsState(address.state);
    const serviceAreaState = normalizeUsState(serviceArea.state);

    if (!address.street.trim() || !address.city.trim() || !addressState || !address.zip.trim() || !serviceArea.city.trim() || !serviceAreaState || !serviceArea.preferredRadiusMiles || serviceArea.preferredRadiusMiles <= 0 || serviceArea.preferredRadiusMiles > DRIVER_CONFIG.MAXIMUM_PREFERRED_RADIUS_MILES) {
      throw new Error(
        `Select a preferred service radius between 1 and ${DRIVER_CONFIG.MAXIMUM_PREFERRED_RADIUS_MILES} miles.`
      );
    }

    const rawAddress = `${address.street}${address.apartment.trim() ? `, ${address.apartment}` : ""}, ${address.city}, ${address.state} ${address.zip}`;
    const location = await geocodeAddress(rawAddress);

    if (!location) {
      throw new Error("We couldn't verify this address. Check the street, city, state, and ZIP code.");
    }

    await updateDoc(driverReference(driverId), {
      address: {
        street: upper(address.street),
        apartment: upper(address.apartment) || null,
        city: upper(address.city),
        state: addressState,
        zip: upper(address.zip),
        formattedAddress: (location.formattedAddress || rawAddress).toUpperCase(),
        latitude: location.latitude,
        longitude: location.longitude,
      },
      serviceArea: {
        city: upper(serviceArea.city),
        state: serviceAreaState,
        /* This is a request only. Admin approval assigns the usable radius. */
        preferredRadiusMiles: Number(serviceArea.preferredRadiusMiles),
        approvedRadiusMiles: draft.serviceArea.approvedRadiusMiles,
      },
      onboardingStep: "vehicle-information",
      updatedAt: serverTimestamp(),
    });

    return this.getDraft(driverId);
  },

  async saveVehicleInformation(
    driverId: string,
    deliveryMethod: DeliveryMethod,
    vehicle: DriverVehicle
  ): Promise<DriverOnboardingDraft> {
    const currentYear = new Date().getFullYear() + 1;
    const registrationState = normalizeUsState(vehicle.registrationState);

    if (!deliveryMethod || !vehicle.make.trim() || !vehicle.model.trim() || !vehicle.year || vehicle.year < 1900 || vehicle.year > currentYear || !vehicle.color.trim() || !vehicle.licensePlate.trim() || !registrationState) {
      throw new Error("Complete every required vehicle field.");
    }

    await updateDoc(driverReference(driverId), {
      deliveryMethod,
      vehicle: {
        make: vehicle.make.trim(),
        model: vehicle.model.trim(),
        year: Number(vehicle.year),
        color: vehicle.color.trim(),
        licensePlate: upper(vehicle.licensePlate),
        registrationState,
      },
      onboardingStep: "documents",
      updatedAt: serverTimestamp(),
    });

    return this.getDraft(driverId);
  },

  async saveDocuments(
    driverId: string,
    input: {
      issuingState: string;
      licenseExpirationDate: string;
      insuranceProvider: string;
      insuranceExpirationDate: string;
      registrationExpirationDate: string;
      files: Partial<Record<DriverImageField, File | null>>;
    }
  ): Promise<DriverOnboardingDraft> {
    const draft = await this.getDraft(driverId);
    const hasLicenseFront = Boolean(input.files["drivers-license-front"] || draft.driversLicense.frontDocumentUrl);
    const hasLicenseBack = Boolean(input.files["drivers-license-back"] || draft.driversLicense.backDocumentUrl);
    const hasInsurance = Boolean(input.files["vehicle-insurance"] || draft.vehicleInsurance.documentUrl);
    const hasRegistration = Boolean(input.files["vehicle-registration"] || draft.vehicleRegistration.documentUrl);

    const issuingState = normalizeUsState(input.issuingState);

    if (!issuingState || !hasLicenseFront || !hasLicenseBack || !hasInsurance || !hasRegistration || !isFutureDate(input.licenseExpirationDate) || !isFutureDate(input.insuranceExpirationDate) || !isFutureDate(input.registrationExpirationDate)) {
      throw new Error("Provide the required documents and valid future expiration dates.");
    }

    const licenseChanged = Boolean(
      input.files["drivers-license-front"] ||
      input.files["drivers-license-back"] ||
      draft.driversLicense.issuingState !== issuingState ||
      draft.driversLicense.expirationDate !== input.licenseExpirationDate
    );
    const insuranceChanged = Boolean(
      input.files["vehicle-insurance"] ||
      draft.vehicleInsurance.provider !== input.insuranceProvider.trim() ||
      draft.vehicleInsurance.expirationDate !== input.insuranceExpirationDate
    );
    const registrationChanged = Boolean(
      input.files["vehicle-registration"] ||
      draft.vehicleRegistration.expirationDate !== input.registrationExpirationDate
    );
    const licenseFileChanged = Boolean(
      input.files["drivers-license-front"] ||
      input.files["drivers-license-back"]
    );
    const insuranceFileChanged = Boolean(input.files["vehicle-insurance"]);
    const registrationFileChanged = Boolean(
      input.files["vehicle-registration"]
    );

    /*
     * Storage accepts every replacement before the onboarding step advances.
     * This prevents a failed upload from leaving a driver at the agreement
     * step without the documents required for review.
     */
    await Promise.all(
      (Object.entries(input.files) as [DriverImageField, File | null][])
        .filter(([, file]) => file)
        .map(([field, file]) => driverImageService.uploadOriginalImage({
          driverId,
          field,
          file: file as File,
        }))
    );

    const licenseReview = licenseChanged
      ? pendingDocumentReview()
      : preserveDocumentReview(draft.driversLicense);
    const insuranceReview = insuranceChanged
      ? pendingDocumentReview()
      : preserveDocumentReview(draft.vehicleInsurance);
    const registrationReview = registrationChanged
      ? pendingDocumentReview()
      : preserveDocumentReview(draft.vehicleRegistration);

    /*
     * Use dotted paths so an asynchronous image processor cannot have its
     * newly written optimized URL overwritten by this metadata save.
     */
    await updateDoc(driverReference(driverId), {
      "driversLicense.issuingState": issuingState,
      "driversLicense.expirationDate": input.licenseExpirationDate,
      "driversLicense.submissionVersion":
        draft.driversLicense.submissionVersion + (licenseFileChanged ? 1 : 0),
      "driversLicense.reviewStatus": licenseReview.reviewStatus,
      "driversLicense.rejectionReason": licenseReview.rejectionReason,
      "driversLicense.reviewedAt": licenseReview.reviewedAt,
      "driversLicense.reviewedBy": licenseReview.reviewedBy,
      "vehicleInsurance.provider": input.insuranceProvider.trim() || null,
      "vehicleInsurance.expirationDate": input.insuranceExpirationDate,
      "vehicleInsurance.submissionVersion":
        draft.vehicleInsurance.submissionVersion + (insuranceFileChanged ? 1 : 0),
      "vehicleInsurance.reviewStatus": insuranceReview.reviewStatus,
      "vehicleInsurance.rejectionReason": insuranceReview.rejectionReason,
      "vehicleInsurance.reviewedAt": insuranceReview.reviewedAt,
      "vehicleInsurance.reviewedBy": insuranceReview.reviewedBy,
      "vehicleRegistration.expirationDate": input.registrationExpirationDate,
      "vehicleRegistration.submissionVersion":
        draft.vehicleRegistration.submissionVersion + (registrationFileChanged ? 1 : 0),
      "vehicleRegistration.reviewStatus": registrationReview.reviewStatus,
      "vehicleRegistration.rejectionReason": registrationReview.rejectionReason,
      "vehicleRegistration.reviewedAt": registrationReview.reviewedAt,
      "vehicleRegistration.reviewedBy": registrationReview.reviewedBy,
      onboardingStep: "agreement",
      updatedAt: serverTimestamp(),
    });

    return this.getDraft(driverId);
  },

  async saveAgreement(
    driverId: string,
    input: {
      acceptedTerms: boolean;
      acceptedPrivacyPolicy: boolean;
      acceptedDriverAgreement: boolean;
      informationCertifiedAccurate: boolean;
    }
  ): Promise<DriverOnboardingDraft> {
    if (!Object.values(input).every(Boolean)) {
      throw new Error("Accept every agreement before continuing.");
    }

    await updateDoc(driverReference(driverId), {
      agreements: {
        terms: {
          accepted: true,
          version: DRIVER_LEGAL_CONFIG.TERMS_VERSION,
          acceptedAt: serverTimestamp(),
        },
        privacyPolicy: {
          accepted: true,
          version: DRIVER_LEGAL_CONFIG.PRIVACY_POLICY_VERSION,
          acceptedAt: serverTimestamp(),
        },
        driverAgreement: {
          accepted: true,
          version: DRIVER_LEGAL_CONFIG.DRIVER_AGREEMENT_VERSION,
          acceptedAt: serverTimestamp(),
        },
        informationCertifiedAccurate: true,
      },
      onboardingStep: "stripe",
      updatedAt: serverTimestamp(),
    });

    return this.getDraft(driverId);
  },

  async complete(driverId: string): Promise<void> {
    const draft = await this.getDraft(driverId);

    requireCompleteDriverApplication(draft);

    await updateDoc(driverReference(driverId), {
      onboardingCompleted: true,

      /* The completed application is now ready for administrator review. */
      status: "pending_review",

      /* A driver cannot receive deliveries until an administrator approves them. */
      availabilityStatus: "offline",

      submittedAt: serverTimestamp(),
      onboardingStep: "stripe",
      updatedAt: serverTimestamp(),
    });

    await setDoc(driverUserReference(driverId), {
      onboardingCompleted: true,
      driverId,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  },

  pathFor(step: DriverOnboardingStep): string {
    return `/driver/onboarding/${step}`;
  },
};

"use client";

/*
|--------------------------------------------------------------------------
| Driver Onboarding Client Service
|--------------------------------------------------------------------------
|
| The browser never reads or writes drivers/{uid}. Each step calls a
| protected Firebase callable; original image bytes are the only direct
| browser upload and are reserved by the Function before Storage accepts it.
|
*/

import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { mapDriverOnboardingDraft } from "@/mappers/driverOnboardingMapper";
import { driverImageService, type DriverImageField } from "./driverImageService";
import type { DeliveryMethod, DriverAddress, DriverOnboardingDraft, DriverOnboardingStep, DriverVehicle } from "@/types/driverOnboarding";

async function callDraft(name: string, data?: unknown): Promise<DriverOnboardingDraft> {
  const result = await httpsCallable<unknown, Record<string, unknown>>(functions, name)(data);
  const raw = result.data;
  const driverId = typeof raw.driverId === "string" ? raw.driverId : "";
  return mapDriverOnboardingDraft(driverId, raw as never);
}

export const driverOnboardingService = {
  getDraft: (_driverId?: string) => callDraft("getDriverOnboardingDraft"),

  async savePersonalInformation(_driverId: string, input: { firstName: string; middleName: string; lastName: string; phone: string; email: string; dateOfBirth: string; profilePhoto: File | null }) {
    const draft = await callDraft("saveDriverPersonalInformation", input);
    if (input.profilePhoto) await driverImageService.uploadOriginalImage({ driverId: draft.driverId, field: "profile-photo", file: input.profilePhoto });
    return this.getDraft();
  },

  saveAddressAndServiceArea(_driverId: string, input: { address: Omit<DriverAddress, "formattedAddress" | "latitude" | "longitude">; serviceArea: { city: string; state: string; preferredRadiusMiles: number | null } }) {
    return callDraft("saveDriverAddressAndServiceArea", input);
  },

  saveVehicleInformation(_driverId: string, deliveryMethod: DeliveryMethod, vehicle: DriverVehicle) {
    return callDraft("saveDriverVehicleInformation", { deliveryMethod, vehicle });
  },

  async saveDocuments(_driverId: string, input: { issuingState: string; licenseExpirationDate: string; insuranceProvider: string; insuranceExpirationDate: string; registrationExpirationDate: string; files: Partial<Record<DriverImageField, File | null>> }) {
    const draft = await this.getDraft();
    const uploaded = (await Promise.all(
      (Object.entries(input.files) as [DriverImageField, File | null][])
        .filter(([, file]) => file)
        .map(async ([field, file]) => {
          await driverImageService.uploadOriginalImage({ driverId: draft.driverId, field, file: file as File });
          return field;
        })
    )).reduce<Record<string, boolean>>((result, field) => ({ ...result, [field]: true }), {});
    return callDraft("saveDriverDocuments", { ...input, files: uploaded });
  },

  saveAgreement(_driverId: string, input: { acceptedTerms: boolean; acceptedPrivacyPolicy: boolean; acceptedDriverAgreement: boolean; informationCertifiedAccurate: boolean }) {
    return callDraft("saveDriverAgreement", input);
  },

  async complete(_driverId: string) {
    await httpsCallable(functions, "completeDriverOnboarding")();
  },

  pathFor(step: DriverOnboardingStep) { return `/driver/onboarding/${step}`; },
};

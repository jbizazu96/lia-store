"use client";

/*
|--------------------------------------------------------------------------
| Store Onboarding Client Service
|--------------------------------------------------------------------------
|
| This browser service is intentionally a callable-Functions client. It does
| not import Firestore and never creates or updates stores or users directly.
| Image bytes go through Storage Rules; each saved step is validated and
| persisted by functions/src/callable/storeOnboarding.ts.
|
*/

import {
  httpsCallable,
} from "firebase/functions";
import {
  auth,
  functions,
} from "@/lib/firebase";
import {
  storeImageService,
} from "./storeImageService";
import type {
  StoreScheduleDay,
} from "@/types/store";
import type {
  StoreOnboardingDraft,
  StoreOwnerOnboardingInfo,
  StoreOnboardingStep,
} from "@/types/storeOnboarding";

function requireOwnedStoreOwnerId(ownerId: string): string {
  const normalizedOwnerId = ownerId.trim();

  if (!auth.currentUser || auth.currentUser.uid !== normalizedOwnerId) {
    throw new Error("You are not authorized to update this store application.");
  }

  return normalizedOwnerId;
}

async function call<T>(name: string, data?: unknown): Promise<T> {
  try {
    const result = await httpsCallable<unknown, T>(functions, name)(data);

    return result.data;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unable to update store onboarding.";

    throw new Error(message);
  }
}

async function ensureDraft(ownerId: string): Promise<StoreOnboardingDraft> {
  requireOwnedStoreOwnerId(ownerId);

  return call<StoreOnboardingDraft>("ensureStoreOnboardingDraft");
}

export const storeOnboardingService = {
  async getDraft(ownerId: string): Promise<StoreOnboardingDraft> {
    requireOwnedStoreOwnerId(ownerId);

    return call<StoreOnboardingDraft>("getStoreOnboardingDraft");
  },

  async saveOwner(
    ownerId: string,
    owner: StoreOwnerOnboardingInfo,
    photoIdFile: File | null,
  ): Promise<StoreOnboardingDraft> {
    const draft = await ensureDraft(ownerId);

    if (!draft.storeId) {
      throw new Error("Unable to prepare your store application.");
    }

    if (photoIdFile) {
      await storeImageService.uploadOriginalImage({
        storeId: draft.storeId,
        field: "owner-photo-id",
        file: photoIdFile,
      });
    }

    return call<StoreOnboardingDraft>("saveStoreOnboardingOwner", {
      owner,
      photoIdUploaded: Boolean(photoIdFile),
    });
  },

  async saveStoreInformation(
    ownerId: string,
    input: {
      name: string;
      email: string;
      phone: string;
      description: string;
      address: string;
      city: string;
      state: string;
      zip: string;
      logo: File | null;
      banner?: File | null;
    },
  ): Promise<StoreOnboardingDraft> {
    const draft = await ensureDraft(ownerId);

    if (!draft.storeId) {
      throw new Error("Complete owner information first.");
    }

    await Promise.all([
      input.logo
        ? storeImageService.uploadOriginalImage({
          storeId: draft.storeId,
          field: "logo",
          file: input.logo,
        })
        : Promise.resolve(),
      input.banner
        ? storeImageService.uploadOriginalImage({
          storeId: draft.storeId,
          field: "banner",
          file: input.banner,
        })
        : Promise.resolve(),
    ]);

    return call<StoreOnboardingDraft>("saveStoreOnboardingStoreInformation", {
      ...input,
      logo: undefined,
      banner: undefined,
      logoUploaded: Boolean(input.logo),
      bannerUploaded: Boolean(input.banner),
    });
  },

  async saveBusinessInformation(
    ownerId: string,
    input: {
      businessType: string;
      registeredName: string;
      ein: string;
      businessStructure: string;
      storeFront: File | null;
      storeInside: File | null;
    },
  ): Promise<StoreOnboardingDraft> {
    const draft = await ensureDraft(ownerId);

    if (!draft.storeId) {
      throw new Error("Complete owner information first.");
    }

    await Promise.all([
      input.storeFront
        ? storeImageService.uploadOriginalImage({
          storeId: draft.storeId,
          field: "front",
          file: input.storeFront,
        })
        : Promise.resolve(),
      input.storeInside
        ? storeImageService.uploadOriginalImage({
          storeId: draft.storeId,
          field: "inside",
          file: input.storeInside,
        })
        : Promise.resolve(),
    ]);

    return call<StoreOnboardingDraft>("saveStoreOnboardingBusinessInformation", {
      ...input,
      storeFront: undefined,
      storeInside: undefined,
      storeFrontUploaded: Boolean(input.storeFront),
      storeInsideUploaded: Boolean(input.storeInside),
    });
  },

  async saveSchedule(
    ownerId: string,
    schedule: StoreScheduleDay[],
  ): Promise<StoreOnboardingDraft> {
    requireOwnedStoreOwnerId(ownerId);

    return call<StoreOnboardingDraft>("saveStoreOnboardingSchedule", {
      schedule,
    });
  },

  async complete(ownerId: string): Promise<void> {
    requireOwnedStoreOwnerId(ownerId);

    await call<{ success: true }>("completeStoreOnboarding");
  },

  pathFor(step: StoreOnboardingStep) {
    return `/store/onboarding/${step}`;
  },
};

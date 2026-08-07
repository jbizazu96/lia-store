/*
|--------------------------------------------------------------------------
| Customer Profile Client Service
|--------------------------------------------------------------------------
|
| Customer profile UI calls this service only. Authenticated Firebase
| Functions own profile data, address validation, and lifecycle changes.
| The browser uploads a profile-image original only to its own Storage path;
| the image Function owns processing and the final profile URL.
|
*/

import {
  auth,
  functions,
  storage,
} from "@/lib/firebase";
import {
  httpsCallable,
} from "firebase/functions";
import {
  ref,
  uploadBytes,
} from "firebase/storage";
import {
  invalidateCached,
  loadCached,
  writeCached,
} from "@/services/cache/clientDataCache";

export interface CustomerProfileAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  latitude: number;
  longitude: number;
  formattedAddress: string;
}

export interface CustomerProfile {
  displayName: string;
  email: string;
  phone: string;
  language: string;
  profileImageUrl: string;
  profileImageStatus: "processing" | "ready" | "failed" | "idle";
  defaultAddress: CustomerProfileAddress | null;
}

async function call<T>(name: string, data?: unknown): Promise<T> {
  try {
    const result = await httpsCallable<unknown, T>(functions, name)(data);
    return result.data;
  } catch (error) {
    throw new Error(
      typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "The profile request could not be completed."
    );
  }
}

export const customerProfileClientService = {
  async getProfile(
    forceRefresh = false,
  ): Promise<CustomerProfile> {
    if (forceRefresh) {
      return writeCached(
        "customer-profile",
        await call<CustomerProfile>("getCustomerProfile"),
        { ttlMs: 30_000 },
      );
    }

    return loadCached(
      "customer-profile",
      () => call<CustomerProfile>("getCustomerProfile"),
      { ttlMs: 30_000 },
    );
  },

  async updateProfile(input: {
    displayName: string;
    phone: string;
    language?: string;
  }): Promise<CustomerProfile> {
    const profile = await call<CustomerProfile>("updateCustomerProfile", input);
    return writeCached("customer-profile", profile, { ttlMs: 30_000 });
  },

  async saveDefaultAddress(
    input: Pick<CustomerProfileAddress, "street" | "city" | "state" | "zip">
  ): Promise<CustomerProfileAddress> {
    const payload = await call<{
      defaultAddress: CustomerProfileAddress;
    }>("saveCustomerDefaultAddress", input);

    invalidateCached("customer-profile");
    invalidateCached(
      `customer-default-location:${auth.currentUser?.uid ?? ""}`,
    );
    return payload.defaultAddress;
  },

  async deleteDefaultAddress(): Promise<void> {
    await call("deleteCustomerDefaultAddress");
    invalidateCached("customer-profile");
    invalidateCached(
      `customer-default-location:${auth.currentUser?.uid ?? ""}`,
    );
  },

  async uploadProfileImage(file: File): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("Sign in again before uploading a profile photo.");

    const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "image";
    const upload = await call<{ imageId: string; originalPath: string }>(
      "beginCustomerProfileImageUpload",
      { contentType: file.type, extension, size: file.size }
    );

    await uploadBytes(ref(storage, upload.originalPath), file, {
      contentType: file.type,
      cacheControl: "private, max-age=0, no-cache",
      customMetadata: {
        userId: user.uid,
        imageId: upload.imageId,
        processingType: "customer-profile-image-original",
      },
    });

    invalidateCached("customer-profile");
  },

  /*
   * A customer account is never deleted by the browser. This starts the
   * protected request workflow, which notifies administrators and waits for
   * their approval before the deletion engine can run.
   */
  async requestAccountDeletion(): Promise<{
    requestId: string;
    status: "pending_review";
    alreadyPending: boolean;
  }> {
    return call(
      "requestAccountDeletion",
      {
        ownerType: "customer",
        reasonCode: "no_longer_needed",
        reasonDetails: null,
      },
    );
  },
};

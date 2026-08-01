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
  async getProfile(): Promise<CustomerProfile> {
    return call<CustomerProfile>("getCustomerProfile");
  },

  async updateProfile(input: {
    displayName: string;
    phone: string;
    language?: string;
  }): Promise<CustomerProfile> {
    return call<CustomerProfile>("updateCustomerProfile", input);
  },

  async saveDefaultAddress(
    input: Pick<CustomerProfileAddress, "street" | "city" | "state" | "zip">
  ): Promise<CustomerProfileAddress> {
    const payload = await call<{
      defaultAddress: CustomerProfileAddress;
    }>("saveCustomerDefaultAddress", input);

    return payload.defaultAddress;
  },

  async deleteDefaultAddress(): Promise<void> {
    await call("deleteCustomerDefaultAddress");
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
  },

  async deleteProfileData(): Promise<void> {
    await call("deleteCustomerProfileData");
  },
};

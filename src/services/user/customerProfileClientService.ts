/*
|--------------------------------------------------------------------------
| Customer Profile Client Service
|--------------------------------------------------------------------------
|
| Customer profile UI calls this service only. Authenticated API routes own
| all Firestore, Storage, and server-side validation work.
|
*/

import {
  auth,
} from "@/lib/firebase";

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

async function authorizedRequest(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Sign in again before managing your profile.");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await user.getIdToken()}`);

  return fetch(path, {
    ...init,
    headers,
  });
}

async function requestJson<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await authorizedRequest(path, init);
  const payload = await response.json().catch(() => ({})) as {
    error?: string;
  } & T;

  if (!response.ok) {
    throw new Error(payload.error ?? "The profile request could not be completed.");
  }

  return payload;
}

export const customerProfileClientService = {
  async getProfile(): Promise<CustomerProfile> {
    return requestJson<CustomerProfile>("/api/customer/profile");
  },

  async updateProfile(input: {
    displayName: string;
    phone: string;
    language?: string;
  }): Promise<CustomerProfile> {
    return requestJson<CustomerProfile>("/api/customer/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  },

  async saveDefaultAddress(
    input: Pick<CustomerProfileAddress, "street" | "city" | "state" | "zip">
  ): Promise<CustomerProfileAddress> {
    const payload = await requestJson<{
      defaultAddress: CustomerProfileAddress;
    }>("/api/customer/profile/address", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    return payload.defaultAddress;
  },

  async deleteDefaultAddress(): Promise<void> {
    await requestJson("/api/customer/profile/address", {
      method: "DELETE",
    });
  },

  async uploadProfileImage(file: File): Promise<void> {
    const formData = new FormData();
    formData.set("file", file);

    await requestJson("/api/customer/profile/image", {
      method: "POST",
      body: formData,
    });
  },

  async deleteProfileData(): Promise<void> {
    await requestJson("/api/customer/profile", {
      method: "DELETE",
    });
  },
};

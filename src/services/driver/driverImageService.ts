"use client";

/*
|--------------------------------------------------------------------------
| Driver Image Service
|--------------------------------------------------------------------------
|
| Driver documents use LIA's resizer pipeline, never Claid. The browser
| submits the original image to an authenticated API route; the route and
| Firebase Function handle authorization, storage, and optimization.
|
*/

import {
  auth,
} from "@/lib/firebase";

export type DriverImageField =
  | "profile-photo"
  | "drivers-license-front"
  | "drivers-license-back"
  | "vehicle-insurance"
  | "vehicle-registration";

export const driverImageService = {
  async uploadOriginalImage({
    driverId,
    field,
    file,
  }: {
    driverId: string;
    field: DriverImageField;
    file: File;
  }): Promise<void> {
    if (!driverId.trim()) {
      throw new Error("A driver ID is required.");
    }

    if (!file.type.startsWith("image/") || file.size <= 0) {
      throw new Error("Please select an image file.");
    }

    if (file.size > 10 * 1024 * 1024) {
      throw new Error("The image must be 10 MB or smaller.");
    }

    const user = auth.currentUser;

    if (!user) {
      throw new Error("Sign in again before uploading an image.");
    }

    const formData = new FormData();
    formData.set("driverId", driverId);
    formData.set("field", field);
    formData.set("file", file);

    const response = await fetch("/api/driver/images/original", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await user.getIdToken()}`,
      },
      body: formData,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error ?? "The image could not be uploaded.");
    }
  },
};

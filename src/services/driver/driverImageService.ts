"use client";

/*
|--------------------------------------------------------------------------
| Driver Image Service
|--------------------------------------------------------------------------
|
| Driver documents use LIA's resizer pipeline, never Claid. The browser
| uploads an original to the driver's private Storage path, whose rule
| requires ownership. Firebase Functions then handle optimization.
|
*/

import {
  auth,
  storage,
} from "@/lib/firebase";
import {
  ref,
  uploadBytes,
} from "firebase/storage";

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

    if (user.uid !== driverId) {
      throw new Error(
        "You can upload images only for your own driver application."
      );
    }

    const extension = file.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "image";
    const imageId = `${Date.now()}-${crypto.randomUUID()}`;
    const originalPath = [
      "drivers",
      driverId,
      "images",
      "originals",
      field,
      `${imageId}.${extension}`,
    ].join("/");

    await uploadBytes(
      ref(storage, originalPath),
      file,
      {
        contentType: file.type,
        cacheControl: "private, max-age=0, no-cache",
        customMetadata: {
          driverId,
          imageId,
          imageField: field,
          processingType: "driver-image-original",
        },
      },
    );
  },
};

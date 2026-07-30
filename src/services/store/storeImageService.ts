"use client";

import { auth } from "@/lib/firebase";

export type StoreImageField = "logo" | "banner" | "owner-photo-id" | "front" | "inside";

interface UploadStoreImageParams {
  storeId: string;
  field: StoreImageField;
  file: File;
}

/**
 * Upload an original store image through the authenticated server route.
 *
 * The route verifies that the current user owns the store and writes with
 * Firebase Admin. The background processStoreImage Function then generates
 * the optimized image and updates the store document.
 */
export const storeImageService = {
  async uploadOriginalImage({
    storeId,
    field,
    file,
  }: UploadStoreImageParams): Promise<void> {
    if (!storeId.trim()) {
      throw new Error("A store ID is required.");
    }

    if (!file.type.startsWith("image/")) {
      throw new Error("Please select an image file.");
    }

    if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
      throw new Error("The image must be between 1 byte and 10 MB.");
    }

    const user = auth.currentUser;

    if (!user) {
      throw new Error("Sign in again before uploading an image.");
    }

    const formData = new FormData();
    formData.set("storeId", storeId);
    formData.set("field", field);
    formData.set("file", file);

    const response = await fetch("/api/store/images/original", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await user.getIdToken()}`,
      },
      body: formData,
    });

    const payload = await response
      .json()
      .catch(() => ({ error: "The image could not be uploaded." }));

    if (!response.ok) {
      throw new Error(payload.error ?? "The image could not be uploaded.");
    }
  },
};

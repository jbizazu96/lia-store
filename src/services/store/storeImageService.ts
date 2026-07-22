"use client";

import {
  getStorage,
  ref,
  uploadBytesResumable,
  type UploadMetadata,
} from "firebase/storage";

export type StoreImageField = "logo" | "banner";

interface UploadStoreImageParams {
  storeId: string;
  field: StoreImageField;
  file: File;
}

function createImageId(): string {
  return `${Date.now()}-${crypto.randomUUID()}`;
}

/**
 * Uploads a customer-facing store image for the background resize Function.
 * The Function updates the store document only after its WebP is ready.
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

    const imageId = createImageId();
    const extension = file.name.split(".").pop()?.toLowerCase() || "image";
    const originalPath =
      `stores/${storeId}/images/originals/${field}/` +
      `${imageId}.${extension}`;

    const metadata: UploadMetadata = {
      contentType: file.type,
      cacheControl: "private, max-age=0, no-cache",
      customMetadata: {
        storeId,
        imageId,
        imageField: field,
        processingType: "store-image-original",
      },
    };

    await new Promise<void>((resolve, reject) => {
      uploadBytesResumable(
        ref(getStorage(), originalPath),
        file,
        metadata
      ).on("state_changed", undefined, reject, resolve);
    });
  },
};

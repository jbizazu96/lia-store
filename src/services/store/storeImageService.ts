"use client";

/*
  Store Image Service.

  The browser uploads only the original file to an owner-protected Storage
  path. It never writes Store Firestore data: the onboarding callable saves
  the step and the processStoreImage Function creates the optimized image.
*/
import {
  auth,
  storage,
} from "@/lib/firebase";
import {
  ref,
  uploadBytesResumable,
} from "firebase/storage";

export type StoreImageField = "logo" | "banner" | "owner-photo-id" | "front" | "inside";

interface UploadStoreImageParams {
  storeId: string;
  field: StoreImageField;
  file: File;
  onProgress?: (progress: number) => void;
}

export const storeImageService = {
  async uploadOriginalImage({
    storeId,
    field,
    file,
    onProgress,
  }: UploadStoreImageParams): Promise<{imageId: string}> {
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

    /*
     * Store upload permission is a server-issued custom claim. Force a token
     * refresh after the onboarding/workspace callable assigns that claim so
     * this first upload is evaluated against the current authorization.
     */
    await user.getIdToken(true);

    const extension = file.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "image";
    const imageId = `${Date.now()}-${crypto.randomUUID()}`;
    const originalPath = [
      "stores",
      storeId,
      "images",
      "originals",
      field,
      `${imageId}.${extension}`,
    ].join("/");

    const upload = uploadBytesResumable(ref(storage, originalPath), file, {
        contentType: file.type,
        cacheControl: "private, max-age=0, no-cache",
        customMetadata: {
          storeId,
          imageId,
          imageField: field,
          processingType: "store-image-original",
        },
    });

    await new Promise<void>((resolve, reject) => {
      upload.on("state_changed", (snapshot) => {
        onProgress?.(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
      }, reject, resolve);
    });
    return {imageId};
  },
};

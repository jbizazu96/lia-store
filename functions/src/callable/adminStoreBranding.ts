/*
|--------------------------------------------------------------------------
| Admin Store Branding Upload
|--------------------------------------------------------------------------
|
| Administrators replace public store branding through this callable rather
| than receiving direct Storage write permission. The original is saved with
| the same metadata used by processStoreImage, which creates the optimized
| public image and updates the store record asynchronously.
|
*/

import { randomUUID } from "crypto";

import * as admin from "firebase-admin";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {
  getStorage,
} from "firebase-admin/storage";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  requireAdminPermission,
} from "../admin/adminAuthorizationService";
import {
  writeAdminAuditLog,
} from "../admin/adminAuditLogService";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");

const MAX_IMAGE_BYTES =
  5 * 1024 * 1024;

const brandingFields = [
  "logo",
  "banner",
] as const;

type BrandingField =
  (typeof brandingFields)[number];

function text(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function isBrandingField(
  value: string,
): value is BrandingField {
  return brandingFields.includes(
    value as BrandingField,
  );
}

function decodeImage(
  value: unknown,
): Buffer {
  const encoded = text(value);

  if (
    !encoded ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Choose a valid image file.",
    );
  }

  const bytes = Buffer.from(
    encoded,
    "base64",
  );

  if (
    bytes.length === 0 ||
    bytes.length > MAX_IMAGE_BYTES
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Store branding images must be between 1 byte and 5 MB.",
    );
  }

  return bytes;
}

export const uploadAdminStoreBrandingImage =
  onCall(
    {
      region: "us-central1",
      memory: "512MiB",
      timeoutSeconds: 120,
    },
    async (request) => {
      const administrator =
        await requireAdminPermission(request, "stores", "write");

      const input = request.data &&
        typeof request.data === "object"
        ? request.data as Record<string, unknown>
        : {};

      const storeId = text(
        input.storeId,
      );
      const field = text(
        input.field,
      );
      const extension = text(
        input.extension,
      ).toLowerCase();
      const contentType = text(
        input.contentType,
      ).toLowerCase();

      if (
        !storeId ||
        !isBrandingField(field) ||
        !["jpg", "jpeg", "png", "webp", "avif"].includes(extension) ||
        ![
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/avif",
        ].includes(contentType)
      ) {
        throw new HttpsError(
          "invalid-argument",
          "Choose a supported logo or banner image.",
        );
      }

      const store = await db
        .collection("stores")
        .doc(storeId)
        .get();

      if (!store.exists) {
        throw new HttpsError(
          "not-found",
          "The store was not found.",
        );
      }

      const bytes = decodeImage(
        input.base64,
      );
      const imageId =
        `${Date.now()}-${randomUUID()}`;
      const originalPath =
        `stores/${storeId}/images/originals/${field}/` +
        `${imageId}.${extension}`;

      await getStorage()
        .bucket()
        .file(originalPath)
        .save(bytes, {
          resumable: false,
          metadata: {
            contentType,
            cacheControl: "private, max-age=0, no-cache",
            metadata: {
              storeId,
              imageId,
              imageField: field,
              processingType: "store-image-original",
              uploadedBy: "admin",
            },
          },
        });

      await db.collection("stores")
        .doc(storeId)
        .update({
          [field === "logo"
            ? "logoImageStatus"
            : "bannerImageStatus"]: "processing",
          updatedAt:
            FieldValue.serverTimestamp(),
        });

      await writeAdminAuditLog(
        administrator,
        {
          action:
            "store_branding_uploaded",
          targetType: "store",
          targetId: storeId,
          details: { field },
        },
      );

      return {
        accepted: true,
        originalPath,
      };
    },
  );

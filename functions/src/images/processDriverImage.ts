/*
|--------------------------------------------------------------------------
| Driver Image Resizer
|--------------------------------------------------------------------------
|
| Processes private driver-application images with LIA's Sharp-based resizer.
| Claid is intentionally not used: background removal is reserved for
| customer-facing product images only.
|
*/

import {
  randomUUID,
} from "crypto";
import {
  onObjectFinalized,
} from "firebase-functions/v2/storage";
import {
  logger,
} from "firebase-functions";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {
  getStorage,
} from "firebase-admin/storage";

import {
  PRODUCT_IMAGE_CONFIG,
} from "./imageTypes";
import {
  processProductImage,
} from "./imageProcessor";
import {
  deleteOriginalImage,
  downloadOriginalImage,
} from "./imageStorage";

type DriverImageField =
  | "profile-photo"
  | "drivers-license-front"
  | "drivers-license-back"
  | "vehicle-insurance"
  | "vehicle-registration";

function getMetadata(metadata: Record<string, string> | undefined) {
  const imageField = metadata?.imageField;

  if (
    metadata?.processingType !== "driver-image-original" ||
    !metadata.driverId ||
    !metadata.imageId ||
    !imageField ||
    ![
      "profile-photo",
      "drivers-license-front",
      "drivers-license-back",
      "vehicle-insurance",
      "vehicle-registration",
    ].includes(imageField)
  ) {
    return null;
  }

  return {
    driverId: metadata.driverId,
    imageId: metadata.imageId,
    imageField: imageField as DriverImageField,
  };
}

export const processDriverImage = onObjectFinalized(
  {
    region: PRODUCT_IMAGE_CONFIG.REGION,
    memory: "1GiB",
    timeoutSeconds: 120,
  },
  async (event) => {
    const bucketName = event.data.bucket;
    const originalPath = event.data.name;
    const metadata = getMetadata(event.data.metadata);

    if (!bucketName || !originalPath || !metadata) return;

    try {
      const image = await processProductImage(
        await downloadOriginalImage(bucketName, originalPath)
      );
      const optimizedPath = `drivers/${metadata.driverId}/images/optimized/${metadata.imageField}/${metadata.imageId}.webp`;
      const token = randomUUID();

      await getStorage().bucket(bucketName).file(optimizedPath).save(image.buffer, {
        resumable: false,
        metadata: {
          contentType: "image/webp",
          cacheControl: PRODUCT_IMAGE_CONFIG.CACHE_CONTROL,
          metadata: {
            firebaseStorageDownloadTokens: token,
            processingType: "driver-image-optimized",
          },
        },
      });

      const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(optimizedPath)}?alt=media&token=${token}`;
      const fieldName: Record<DriverImageField, string> = {
        "profile-photo": "profilePhotoUrl",
        "drivers-license-front": "driversLicense.frontDocumentUrl",
        "drivers-license-back": "driversLicense.backDocumentUrl",
        "vehicle-insurance": "vehicleInsurance.documentUrl",
        "vehicle-registration": "vehicleRegistration.documentUrl",
      };
      const pathFieldName: Record<DriverImageField, string> = {
        "profile-photo": "profilePhotoImagePath",
        "drivers-license-front": "driversLicenseFrontImagePath",
        "drivers-license-back": "driversLicenseBackImagePath",
        "vehicle-insurance": "vehicleInsuranceImagePath",
        "vehicle-registration": "vehicleRegistrationImagePath",
      };
      const statusFieldName: Record<DriverImageField, string> = {
        "profile-photo": "profilePhotoImageStatus",
        "drivers-license-front": "driversLicenseFrontImageStatus",
        "drivers-license-back": "driversLicenseBackImageStatus",
        "vehicle-insurance": "vehicleInsuranceImageStatus",
        "vehicle-registration": "vehicleRegistrationImageStatus",
      };
      const reference = getFirestore("default").collection("drivers").doc(metadata.driverId);

      const previousPath = await getFirestore("default").runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);

        if (!snapshot.exists) throw new Error(`Driver not found: ${metadata.driverId}`);

        const previous = snapshot.data()?.[pathFieldName[metadata.imageField]];
        transaction.update(reference, {
          [fieldName[metadata.imageField]]: url,
          [pathFieldName[metadata.imageField]]: optimizedPath,
          [statusFieldName[metadata.imageField]]: "ready",
          updatedAt: FieldValue.serverTimestamp(),
        });

        return typeof previous === "string" ? previous : null;
      });

      await deleteOriginalImage(bucketName, originalPath);

      if (previousPath && previousPath !== optimizedPath) {
        await getStorage().bucket(bucketName).file(previousPath).delete({ ignoreNotFound: true });
      }
    } catch (error) {
      logger.error("Driver image processing failed.", { originalPath, error });
      throw error;
    }
  }
);

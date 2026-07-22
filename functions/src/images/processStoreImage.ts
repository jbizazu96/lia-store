import { onObjectFinalized } from "firebase-functions/v2/storage";
import { logger } from "firebase-functions";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "crypto";
import { getStorage } from "firebase-admin/storage";
import { PRODUCT_IMAGE_CONFIG } from "./imageTypes";
import { processProductImage } from "./imageProcessor";
import {
  deleteOriginalImage,
  downloadOriginalImage,
} from "./imageStorage";

type StoreImageField = "logo" | "banner";

function getMetadata(metadata: Record<string, string> | undefined) {
  if (
    metadata?.processingType !== "store-image-original" ||
    !metadata.storeId ||
    !metadata.imageId ||
    (metadata.imageField !== "logo" && metadata.imageField !== "banner")
  ) {
    return null;
  }

  return {
    storeId: metadata.storeId,
    imageId: metadata.imageId,
    imageField: metadata.imageField as StoreImageField,
  };
}

export const processStoreImage = onObjectFinalized(
  {
    region: PRODUCT_IMAGE_CONFIG.REGION,
    memory: "1GiB",
    timeoutSeconds: 120,
  },
  async (event) => {
    const bucketName = event.data.bucket;
    const originalPath = event.data.name;
    const metadata = getMetadata(event.data.metadata);

    if (!bucketName || !originalPath || !metadata) {
      return;
    }

    try {
      const image = await processProductImage(
        await downloadOriginalImage(bucketName, originalPath)
      );
      const optimizedPath =
        `stores/${metadata.storeId}/images/optimized/${metadata.imageField}/` +
        `${metadata.imageId}.webp`;
      const token = randomUUID();
      const file = getStorage().bucket(bucketName).file(optimizedPath);

      await file.save(image.buffer, {
        resumable: false,
        metadata: {
          contentType: "image/webp",
          cacheControl: PRODUCT_IMAGE_CONFIG.CACHE_CONTROL,
          metadata: {
            firebaseStorageDownloadTokens: token,
            processingType: "store-image-optimized",
          },
        },
      });

      const fieldName =
        metadata.imageField === "logo" ? "logoUrl" : "bannerUrl";
      const pathFieldName =
        metadata.imageField === "logo" ? "logoImagePath" : "bannerImagePath";
      const imageUrl =
        `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/` +
        `${encodeURIComponent(optimizedPath)}?alt=media&token=${token}`;
      const storeReference = getFirestore("default")
        .collection("stores")
        .doc(metadata.storeId);

      const oldPath = await getFirestore("default").runTransaction(async (transaction) => {
        const storeSnapshot = await transaction.get(storeReference);
        if (!storeSnapshot.exists) {
          throw new Error(`Store not found: ${metadata.storeId}`);
        }

        const previousPath = storeSnapshot.data()?.[pathFieldName];
        transaction.update(storeReference, {
          [fieldName]: imageUrl,
          [pathFieldName]: optimizedPath,
          [`${metadata.imageField}ImageStatus`]: "ready",
          updatedAt: FieldValue.serverTimestamp(),
        });

        return typeof previousPath === "string" ? previousPath : null;
      });

      await deleteOriginalImage(bucketName, originalPath);

      if (oldPath && oldPath !== optimizedPath) {
        await getStorage().bucket(bucketName).file(oldPath).delete({
          ignoreNotFound: true,
        });
      }
    } catch (error) {
      logger.error("Store image processing failed.", { originalPath, error });
      throw error;
    }
  }
);

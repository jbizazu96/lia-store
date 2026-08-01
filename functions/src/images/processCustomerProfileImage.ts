/*
|--------------------------------------------------------------------------
| Customer Profile Image Processor
|--------------------------------------------------------------------------
|
| Resizes a private customer profile-image original into WebP, updates only
| the matching user profile, and cleans up replaced files after success.
|
*/

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
  randomUUID,
} from "crypto";

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

function getMetadata(
  originalPath: string,
  metadata: Record<string, string> | undefined
) {
  const pathMatch = originalPath.match(
    /^users\/([^/]+)\/images\/originals\/profile\/[^/]+$/
  );

  if (
    metadata?.processingType !== "customer-profile-image-original" ||
    !metadata.userId ||
    !metadata.imageId ||
    !pathMatch ||
    pathMatch[1] !== metadata.userId
  ) {
    return null;
  }

  return {
    userId: metadata.userId,
    imageId: metadata.imageId,
  };
}

export const processCustomerProfileImage = onObjectFinalized(
  {
    region: PRODUCT_IMAGE_CONFIG.REGION,
    memory: "1GiB",
    timeoutSeconds: 120,
  },
  async (event) => {
    const bucketName = event.data.bucket;
    const originalPath = event.data.name;
    const metadata = originalPath
      ? getMetadata(originalPath, event.data.metadata)
      : null;

    if (!bucketName || !originalPath || !metadata) {
      return;
    }

    const firestore = getFirestore("default");
    const userReference = firestore.collection("users").doc(metadata.userId);

    try {
      const image = await processProductImage(
        await downloadOriginalImage(bucketName, originalPath)
      );
      const optimizedPath =
        `users/${metadata.userId}/images/optimized/profile/` +
        `${metadata.imageId}.webp`;
      const token = randomUUID();

      await getStorage().bucket(bucketName).file(optimizedPath).save(image.buffer, {
        resumable: false,
        metadata: {
          contentType: "image/webp",
          cacheControl: PRODUCT_IMAGE_CONFIG.CACHE_CONTROL,
          metadata: {
            firebaseStorageDownloadTokens: token,
            processingType: "customer-profile-image-optimized",
          },
        },
      });

      const imageUrl =
        `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/` +
        `${encodeURIComponent(optimizedPath)}?alt=media&token=${token}`;
      const previousPath = await firestore.runTransaction(async (transaction) => {
        const userSnapshot = await transaction.get(userReference);

        if (
          !userSnapshot.exists ||
          userSnapshot.data()?.profileImageOriginalPath !== originalPath
        ) {
          return null;
        }

        const previousImagePath =
          typeof userSnapshot.data()?.profileImagePath === "string"
            ? userSnapshot.data()?.profileImagePath
            : null;

        transaction.update(userReference, {
          profileImageUrl: imageUrl,
          profileImagePath: optimizedPath,
          profileImageOriginalPath: null,
          profileImageStatus: "ready",
          profileImageError: null,
          profileImageProcessedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        return previousImagePath;
      });

      await deleteOriginalImage(bucketName, originalPath);

      if (previousPath && previousPath !== optimizedPath) {
        await getStorage().bucket(bucketName).file(previousPath).delete({
          ignoreNotFound: true,
        });
      }
    } catch (error) {
      logger.error("Customer profile image processing failed.", {
        originalPath,
        error,
      });

      await firestore.runTransaction(async (transaction) => {
        const userSnapshot = await transaction.get(userReference);

        if (
          userSnapshot.exists &&
          userSnapshot.data()?.profileImageOriginalPath === originalPath
        ) {
          transaction.update(userReference, {
            profileImageStatus: "failed",
            profileImageError: "Unable to process the profile image.",
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });

      throw error;
    }
  }
);

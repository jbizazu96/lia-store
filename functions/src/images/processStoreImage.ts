import { onObjectFinalized } from "firebase-functions/v2/storage";
import { logger } from "firebase-functions";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "crypto";
import { getStorage } from "firebase-admin/storage";
import sharp from "sharp";
import { PRODUCT_IMAGE_CONFIG } from "./imageTypes";
import { processProductImage } from "./imageProcessor";
import {
  deleteOriginalImage,
  downloadOriginalImage,
} from "./imageStorage";

type StoreImageField = "logo" | "banner" | "owner-photo-id" | "front" | "inside";
type PublicStoreImageField = "logo" | "banner";

const STORE_IMAGE_VARIANTS = {
  logo: [
    {name: "thumbnail", width: 128, height: 128, quality: 74},
    {name: "small", width: 256, height: 256, quality: 78},
    {name: "medium", width: 512, height: 512, quality: 82},
  ],
  banner: [
    {name: "small", width: 640, height: 360, quality: 76},
    {name: "medium", width: 1024, height: 576, quality: 80},
    {name: "large", width: 1600, height: 900, quality: 82},
  ],
} as const;

function downloadUrl(bucketName: string, path: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/` +
    `${encodeURIComponent(path)}?alt=media&token=${token}`;
}

async function createPublicStoreVariants(input: {
  bucketName: string;
  storeId: string;
  imageId: string;
  field: PublicStoreImageField;
  original: Buffer;
}) {
  const bucket = getStorage().bucket(input.bucketName);
  const variants = STORE_IMAGE_VARIANTS[input.field];
  const results = await Promise.all(variants.map(async (variant) => {
    const buffer = await sharp(input.original)
      .rotate()
      .resize({
        width: variant.width,
        height: variant.height,
        fit: input.field === "banner" ? "cover" : "inside",
        withoutEnlargement: true,
      })
      .webp({quality: variant.quality, effort: 4})
      .toBuffer();
    const path = `stores/${input.storeId}/images/optimized/${input.field}/` +
      `${input.imageId}/${variant.name}.webp`;
    const token = randomUUID();
    await bucket.file(path).save(buffer, {
      resumable: false,
      metadata: {
        contentType: "image/webp",
        cacheControl: PRODUCT_IMAGE_CONFIG.CACHE_CONTROL,
        metadata: {
          firebaseStorageDownloadTokens: token,
          processingType: "store-image-optimized",
          variant: variant.name,
        },
      },
    });
    return {name: variant.name, path, url: downloadUrl(input.bucketName, path, token)};
  }));

  return {
    urls: Object.fromEntries(results.map((variant) => [variant.name, variant.url])),
    paths: Object.fromEntries(results.map((variant) => [variant.name, variant.path])),
  };
}

function getMetadata(metadata: Record<string, string> | undefined) {
  if (
    metadata?.processingType !== "store-image-original" ||
    !metadata.storeId ||
    !metadata.imageId ||
    (metadata.imageField !== "logo" && metadata.imageField !== "banner" && metadata.imageField !== "owner-photo-id" && metadata.imageField !== "front" && metadata.imageField !== "inside")
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
      const original = await downloadOriginalImage(bucketName, originalPath);
      const publicVariants = metadata.imageField === "logo" || metadata.imageField === "banner" ?
        await createPublicStoreVariants({
          bucketName,
          storeId: metadata.storeId,
          imageId: metadata.imageId,
          field: metadata.imageField,
          original,
        }) : null;
      const image = publicVariants ? null : await processProductImage(original);
      const optimizedPath =
        publicVariants ? publicVariants.paths[
          metadata.imageField === "logo" ? "medium" : "large"
        ] : `stores/${metadata.storeId}/images/optimized/${metadata.imageField}/` +
          `${metadata.imageId}.webp`;
      const token = randomUUID();
      if (image) {
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
      }

      const fieldName = {
        logo: "logoUrl", banner: "bannerUrl", front: "storeFrontUrl",
        inside: "storeInsideUrl", "owner-photo-id": "owner.photoIdUrl",
      }[metadata.imageField];
      const pathFieldName = {
        logo: "logoImagePath", banner: "bannerImagePath", front: "storeFrontImagePath",
        inside: "storeInsideImagePath", "owner-photo-id": "ownerPhotoIdImagePath",
      }[metadata.imageField];
      const statusFieldName: Record<StoreImageField, string> = {
        logo: "logoImageStatus",
        banner: "bannerImageStatus",
        front: "storeFrontImageStatus",
        inside: "storeInsideImageStatus",
        "owner-photo-id": "ownerPhotoIdImageStatus",
      };
      const imageUrl = publicVariants ? publicVariants.urls[
        metadata.imageField === "logo" ? "medium" : "large"
      ] : downloadUrl(bucketName, optimizedPath, token);
      const storeReference = getFirestore("default")
        .collection("stores")
        .doc(metadata.storeId);

      const oldPaths = await getFirestore("default").runTransaction(async (transaction) => {
        const storeSnapshot = await transaction.get(storeReference);
        if (!storeSnapshot.exists) {
          throw new Error(`Store not found: ${metadata.storeId}`);
        }

        const previousPath = storeSnapshot.data()?.[pathFieldName];
        const variantPathsField = `${metadata.imageField}ImageVariantPaths`;
        const previousVariantPaths = storeSnapshot.data()?.[variantPathsField];
        transaction.update(storeReference, {
          [fieldName]: imageUrl,
          [pathFieldName]: optimizedPath,
          ...(publicVariants ? {
            [`${metadata.imageField}ImageVariants`]: publicVariants.urls,
            [variantPathsField]: publicVariants.paths,
          } : {}),
          [statusFieldName[metadata.imageField]]: "ready",
          updatedAt: FieldValue.serverTimestamp(),
        });

        return [
          ...(typeof previousPath === "string" ? [previousPath] : []),
          ...(previousVariantPaths && typeof previousVariantPaths === "object" ?
            Object.values(previousVariantPaths).filter(
              (value): value is string => typeof value === "string"
            ) : []),
        ];
      });

      await deleteOriginalImage(bucketName, originalPath);

      const currentPaths = new Set(publicVariants ?
        Object.values(publicVariants.paths) : [optimizedPath]);
      await Promise.all([...new Set(oldPaths)]
        .filter((path) => !currentPaths.has(path))
        .map((path) => getStorage().bucket(bucketName).file(path).delete({
          ignoreNotFound: true,
        })));
    } catch (error) {
      logger.error("Store image processing failed.", { originalPath, error });
      throw error;
    }
  }
);

/*
|--------------------------------------------------------------------------
| Gallery Image Firestore Helpers
|--------------------------------------------------------------------------
|
| Manages independently processed front and back product images.
|
| Gallery document path:
|
| products/{productId}/images/{galleryImageId}
|
| Responsibilities:
|
| - Confirm that an upload is still current.
| - Mark processing and Claid enhancement states.
| - Save responsive image variants.
| - Record processing failures.
| - Mirror the completed front image onto the parent product document.
|
| This file contains no Storage, Sharp, or HTTP logic.
|
*/

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

import type {
  ProductImageRole,
  ProductImageVariantMap,
  ProductImageVariantName,
} from "./imageTypes";

/*
|--------------------------------------------------------------------------
| Shared Parameters
|--------------------------------------------------------------------------
*/

interface GalleryImageIdentity {
  productId: string;

  galleryImageId: string;

  originalImagePath: string;
}

/*
|--------------------------------------------------------------------------
| Get Gallery Image Reference
|--------------------------------------------------------------------------
*/

function getGalleryImageReference(
  productId: string,
  galleryImageId: string
) {
  return getFirestore("default")
    .collection("products")
    .doc(productId)
    .collection("images")
    .doc(galleryImageId);
}

/*
|--------------------------------------------------------------------------
| Validate Gallery Identity
|--------------------------------------------------------------------------
*/

function isValidIdentity({
  productId,
  galleryImageId,
  originalImagePath,
}: GalleryImageIdentity): boolean {
  return Boolean(
    productId.trim() &&
    galleryImageId.trim() &&
    originalImagePath.trim()
  );
}

/*
|--------------------------------------------------------------------------
| Mark Gallery Image Processing
|--------------------------------------------------------------------------
|
| The original image path acts as a concurrency token.
|
| An older upload cannot continue if the store owner has already replaced it.
|
*/

export async function markGalleryImageProcessing({
  productId,
  galleryImageId,
  originalImagePath,
}: GalleryImageIdentity): Promise<boolean> {
  if (
    !isValidIdentity({
      productId,
      galleryImageId,
      originalImagePath,
    })
  ) {
    return false;
  }

  const firestore =
    getFirestore("default");

  const imageReference =
    getGalleryImageReference(
      productId,
      galleryImageId
    );

  return firestore.runTransaction(
    async (transaction) => {
      const imageSnapshot =
        await transaction.get(
          imageReference
        );

      if (
        !imageSnapshot.exists ||
        imageSnapshot.data()
          ?.originalImagePath !==
          originalImagePath
      ) {
        return false;
      }

      transaction.update(
        imageReference,
        {
          status:
            "processing",

          imageError:
            null,

          updatedAt:
            FieldValue.serverTimestamp(),
        }
      );

      return true;
    }
  );
}

/*
|--------------------------------------------------------------------------
| Mark Gallery Image Enhancing
|--------------------------------------------------------------------------
*/

interface MarkGalleryImageEnhancingParams
  extends GalleryImageIdentity {
  claidTaskId: number;
}

export async function markGalleryImageEnhancing({
  productId,
  galleryImageId,
  originalImagePath,
  claidTaskId,
}: MarkGalleryImageEnhancingParams):
Promise<boolean> {
  if (
    !isValidIdentity({
      productId,
      galleryImageId,
      originalImagePath,
    }) ||
    !Number.isFinite(
      claidTaskId
    ) ||
    claidTaskId <= 0
  ) {
    return false;
  }

  const firestore =
    getFirestore("default");

  const imageReference =
    getGalleryImageReference(
      productId,
      galleryImageId
    );

  return firestore.runTransaction(
    async (transaction) => {
      const imageSnapshot =
        await transaction.get(
          imageReference
        );

      if (
        !imageSnapshot.exists ||
        imageSnapshot.data()
          ?.originalImagePath !==
          originalImagePath
      ) {
        return false;
      }

      transaction.update(
        imageReference,
        {
          status:
            "enhancing",

          claidTaskId,

          claidStatus:
            "accepted",

          claidError:
            null,

          imageError:
            null,

          updatedAt:
            FieldValue.serverTimestamp(),
        }
      );

      return true;
    }
  );
}

/*
|--------------------------------------------------------------------------
| Mark Gallery Image Ready
|--------------------------------------------------------------------------
|
| Front image:
|
| - Updates its gallery document.
| - Becomes the parent product's primary image.
| - Supplies imageUrl and imageVariants used by cards and search.
|
| Back image:
|
| - Updates only its gallery document.
| - Remains available for the product-details page.
|
*/

interface MarkGalleryImageReadyParams
  extends GalleryImageIdentity {
  role: ProductImageRole;

  imageVariants:
    ProductImageVariantMap;

  defaultVariant:
    ProductImageVariantName;
}

interface MarkGalleryImageReadyResult {
  updated: boolean;

  previousVariantPaths: string[];
}

export async function markGalleryImageReady({
  productId,
  galleryImageId,
  originalImagePath,
  role,
  imageVariants,
  defaultVariant,
}: MarkGalleryImageReadyParams):
Promise<MarkGalleryImageReadyResult> {
  if (
    !isValidIdentity({
      productId,
      galleryImageId,
      originalImagePath,
    })
  ) {
    return {
      updated:
        false,

      previousVariantPaths:
        [],
    };
  }

  if (
    role !== "front" &&
    role !== "back"
  ) {
    throw new Error(
      "The gallery image role must be front or back."
    );
  }

  const defaultImage =
    imageVariants[
      defaultVariant
    ];

  if (!defaultImage) {
    throw new Error(
      `The default image variant "${defaultVariant}" is missing.`
    );
  }

  const firestore =
    getFirestore("default");

  const productReference =
    firestore
      .collection("products")
      .doc(productId);

  const imageReference =
    productReference
      .collection("images")
      .doc(galleryImageId);

  return firestore.runTransaction(
    async (transaction) => {
      const imageSnapshot =
        await transaction.get(
          imageReference
        );

      if (
        !imageSnapshot.exists ||
        imageSnapshot.data()
          ?.originalImagePath !==
          originalImagePath
      ) {
        return {
          updated:
            false,

          previousVariantPaths:
            [],
        };
      }

      const currentImage =
        imageSnapshot.data();

      const previousVariantPaths:
      string[] = [];

      const previousVariants =
        currentImage?.imageVariants;

      if (
        previousVariants &&
        typeof previousVariants ===
          "object"
      ) {
        for (
          const variant of
          Object.values(
            previousVariants
          )
        ) {
          if (
            variant &&
            typeof variant ===
              "object" &&
            "path" in variant &&
            typeof variant.path ===
              "string"
          ) {
            previousVariantPaths.push(
              variant.path
            );
          }
        }
      }

      /*
      |--------------------------------------------------------------------------
      | Update Gallery Image
      |--------------------------------------------------------------------------
      */

      transaction.update(
        imageReference,
        {
          status:
            "ready",

          imageUrl:
            defaultImage.url,

          imageVariants,

          originalImagePath:
            null,

          optimizedImagePath:
            defaultImage.path,

          imageError:
            null,

          claidStatus:
            "done",

          claidError:
            null,

          imageProcessedAt:
            FieldValue.serverTimestamp(),

          imageWidth:
            defaultImage.width,

          imageHeight:
            defaultImage.height,

          imageSizeBytes:
            defaultImage.sizeBytes,

          imageFormat:
            defaultImage.format,

          updatedAt:
            FieldValue.serverTimestamp(),
        }
      );

      /*
      |--------------------------------------------------------------------------
      | Mirror Front Image Onto Product
      |--------------------------------------------------------------------------
      |
      | Existing cards, search, cart, and checkout continue reading the parent
      | product's imageUrl and imageVariants.
      |
      */

      if (role === "front") {
        transaction.update(
          productReference,
          {
            imageUrl:
              defaultImage.url,

            imageVariants,

            imageStatus:
              "ready",

            primaryImageId:
              galleryImageId,

            originalImagePath:
              null,

            optimizedImagePath:
              defaultImage.path,

            imageError:
              null,

            imageProcessedAt:
              FieldValue.serverTimestamp(),

            imageWidth:
              defaultImage.width,

            imageHeight:
              defaultImage.height,

            imageSizeBytes:
              defaultImage.sizeBytes,

            imageFormat:
              defaultImage.format,

            updatedAt:
              FieldValue.serverTimestamp(),
          }
        );
      }

      return {
        updated:
          true,

        previousVariantPaths,
      };
    }
  );
}

/*
|--------------------------------------------------------------------------
| Mark Gallery Image Failed
|--------------------------------------------------------------------------
*/

interface MarkGalleryImageFailedParams
  extends GalleryImageIdentity {
  error: unknown;
}

export async function markGalleryImageFailed({
  productId,
  galleryImageId,
  originalImagePath,
  error,
}: MarkGalleryImageFailedParams):
Promise<boolean> {
  if (
    !isValidIdentity({
      productId,
      galleryImageId,
      originalImagePath,
    })
  ) {
    return false;
  }

  const message =
    error instanceof Error
      ? error.message
      : "Gallery image processing failed.";

  const firestore =
    getFirestore("default");

  const imageReference =
    getGalleryImageReference(
      productId,
      galleryImageId
    );

  return firestore.runTransaction(
    async (transaction) => {
      const imageSnapshot =
        await transaction.get(
          imageReference
        );

      if (
        !imageSnapshot.exists ||
        imageSnapshot.data()
          ?.originalImagePath !==
          originalImagePath
      ) {
        return false;
      }

      transaction.update(
        imageReference,
        {
          status:
            "failed",

          claidStatus:
            "failed",

          claidError:
            message,

          imageError:
            message,

          updatedAt:
            FieldValue.serverTimestamp(),
        }
      );

      return true;
    }
  );
}
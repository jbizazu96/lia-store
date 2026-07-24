/*
|--------------------------------------------------------------------------
| Image Firestore Helpers
|--------------------------------------------------------------------------
|
| Updates product documents during the asynchronous image pipeline.
|
| Responsibilities:
|
| - Mark processing status.
| - Save optimized image metadata.
| - Record failures.
|
| This file contains no Sharp or Storage logic.
|
*/

import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";

import type {
  ProductImageProcessingResult,
  ProductImageVariantMap,
  ProductImageVariantName,
} from "./imageTypes";

/*
|--------------------------------------------------------------------------
| Mark Product Image Processing
|--------------------------------------------------------------------------
*/

export async function markProductImageProcessing(
  productId: string,
  originalImagePath: string
): Promise<boolean> {
  if (!productId.trim()) {
    throw new Error(
      "A product ID is required."
    );
  }

  const productReference =
    getFirestore("default")
      .collection("products")
      .doc(productId);

  return getFirestore("default").runTransaction(
    async (transaction) => {
      const productSnapshot =
        await transaction.get(productReference);

      if (
        !productSnapshot.exists ||
        productSnapshot.data()?.originalImagePath !==
          originalImagePath
      ) {
        return false;
      }

      transaction.update(productReference, {
        imageStatus:
          "processing",

        imageError:
          null,

        updatedAt:
          FieldValue.serverTimestamp(),
      });

      return true;
    }
  );
}


/*
|--------------------------------------------------------------------------
| Mark Product Image Ready
|--------------------------------------------------------------------------
*/

export async function markProductImageReady(
  result: ProductImageProcessingResult
): Promise<{
  updated: boolean;
  previousOptimizedImagePath: string | null;
}> {
  const firestore = getFirestore("default");
  const productReference = firestore
    .collection("products")
    .doc(result.productId);

  return firestore.runTransaction(
    async (transaction) => {
      const productSnapshot =
        await transaction.get(productReference);

      const product = productSnapshot.data();

      /*
       * A store may select another image while this one is processing.
       * Only the upload currently referenced by the product is allowed to
       * become the customer-facing image.
       */
      if (
        !productSnapshot.exists ||
        product?.originalImagePath !==
          result.originalImagePath
      ) {
        return {
          updated: false,
          previousOptimizedImagePath: null,
        };
      }

      const previousOptimizedImagePath =
        typeof product.optimizedImagePath === "string"
          ? product.optimizedImagePath
          : null;

      transaction.update(productReference, {
        imageUrl:
          result.optimizedImageUrl,

        imageStatus:
          "ready",

        originalImagePath:
          null,

        optimizedImagePath:
          result.optimizedImagePath,

        imageError:
          null,

        imageProcessedAt:
          FieldValue.serverTimestamp(),

        imageWidth:
          result.width,

        imageHeight:
          result.height,

        imageSizeBytes:
          result.sizeBytes,

        imageFormat:
          result.format,

        updatedAt:
          FieldValue.serverTimestamp(),
      });

      return {
        updated: true,
        previousOptimizedImagePath,
      };
    }
  );
}

/*
|--------------------------------------------------------------------------
| Mark Product Image Variants Ready
|--------------------------------------------------------------------------
|
| Saves all customer-facing image variants to the product document.
|
| The configured default variant remains available through imageUrl so older
| components continue working during the frontend migration.
|
*/

interface MarkProductImageVariantsReadyParams {
  productId: string;

  originalImagePath: string;

  imageVariants: ProductImageVariantMap;

  defaultVariant:
    ProductImageVariantName;
}

interface MarkProductImageVariantsReadyResult {
  updated: boolean;

  previousVariantPaths: string[];
}

export async function markProductImageVariantsReady({
  productId,
  originalImagePath,
  imageVariants,
  defaultVariant,
}: MarkProductImageVariantsReadyParams):
Promise<MarkProductImageVariantsReadyResult> {
  if (
    !productId.trim() ||
    !originalImagePath.trim()
  ) {
    return {
      updated:
        false,

      previousVariantPaths:
        [],
    };
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

  return firestore.runTransaction(
    async (transaction) => {
      const productSnapshot =
        await transaction.get(
          productReference
        );

      const product =
        productSnapshot.data();

      /*
       * Only the image currently referenced by the product may become ready.
       *
       * This prevents a slow older upload from replacing a newer image.
       */

      if (
        !productSnapshot.exists ||
        product?.originalImagePath !==
          originalImagePath
      ) {
        return {
          updated:
            false,

          previousVariantPaths:
            [],
        };
      }

      /*
       * Collect old variant paths so Storage cleanup can happen only after
       * Firestore safely references the new image set.
       */

      const previousImageVariants =
        product.imageVariants;

      const previousVariantPaths:
      string[] = [];

      if (
        previousImageVariants &&
        typeof previousImageVariants ===
          "object"
      ) {
        for (
          const variant of
          Object.values(
            previousImageVariants
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

      transaction.update(
        productReference,
        {
          /*
           * Backward-compatible default image.
           */
          imageUrl:
            defaultImage.url,

          imageStatus:
            "ready",

          originalImagePath:
            null,

          /*
           * Retain this legacy field temporarily for existing cleanup and
           * debugging logic.
           */
          optimizedImagePath:
            defaultImage.path,

          /*
           * New responsive image map.
           */
          imageVariants,

          imageError:
            null,

          claidStatus:
            "done",

          claidError:
            null,

          imageProcessedAt:
            FieldValue.serverTimestamp(),

          /*
           * Legacy image metadata now describes the default variant.
           */
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
| Mark Product Image Failed
|--------------------------------------------------------------------------
*/

export async function markProductImageFailed(
  productId: string,
  originalImagePath: string,
  error: unknown
): Promise<boolean> {
    if (
    !productId.trim() ||
    !originalImagePath.trim()
  ) {
    return false;
  }

  const message =
    error instanceof Error
      ? error.message
      : "Image processing failed.";

  const firestore =
    getFirestore("default");

  const productReference =
    firestore
      .collection("products")
      .doc(productId);

  return firestore.runTransaction(
    async (transaction) => {
      const productSnapshot =
        await transaction.get(
          productReference
        );

      if (
        !productSnapshot.exists ||
        productSnapshot.data()
          ?.originalImagePath !==
          originalImagePath
      ) {
        return false;
      }

      transaction.update(
        productReference,
        {
          imageStatus:
            "failed",

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

/*
|--------------------------------------------------------------------------
| Mark Product Image Enhancing
|--------------------------------------------------------------------------
|
| Stores the Claid task ID and marks the product as being enhanced.
|
| The original image path is checked transactionally so an older upload
| cannot overwrite a newer replacement.
|
*/

export async function markProductImageEnhancing(
  productId: string,
  originalImagePath: string,
  claidTaskId: number
): Promise<boolean> {
  if (
    !productId.trim() ||
    !originalImagePath.trim() ||
    !Number.isFinite(claidTaskId) ||
    claidTaskId <= 0
  ) {
    return false;
  }

  const firestore =
    getFirestore("default");

  const productReference =
    firestore
      .collection("products")
      .doc(productId);

  return firestore.runTransaction(
    async (transaction) => {
      const productSnapshot =
        await transaction.get(
          productReference
        );

      if (
        !productSnapshot.exists ||
        productSnapshot.data()
          ?.originalImagePath !==
          originalImagePath
      ) {
        return false;
      }

      transaction.update(
        productReference,
        {
          imageStatus:
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
| Mark Claid Enhancement Failed
|--------------------------------------------------------------------------
|
| Records a Claid-specific failure only when the failed task still belongs to
| the product's current original image.
|
*/

export async function markProductImageEnhancementFailed(
  productId: string,
  originalImagePath: string,
  error: unknown
): Promise<boolean> {
  if (
    !productId.trim() ||
    !originalImagePath.trim()
  ) {
    return false;
  }

  const message =
    error instanceof Error
      ? error.message
      : "Claid enhancement failed.";

  const firestore =
    getFirestore("default");

  const productReference =
    firestore
      .collection("products")
      .doc(productId);

  return firestore.runTransaction(
    async (transaction) => {
      const productSnapshot =
        await transaction.get(
          productReference
        );

      if (
        !productSnapshot.exists ||
        productSnapshot.data()
          ?.originalImagePath !==
          originalImagePath
      ) {
        return false;
      }

      transaction.update(
        productReference,
        {
          imageStatus:
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

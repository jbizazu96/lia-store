/*
|--------------------------------------------------------------------------
| Product Gallery Service
|--------------------------------------------------------------------------
|
| Reads processed front and back product images from Firestore.
|
| Firestore path:
|
| products/{productId}/images/{imageId}
|
| This service contains no upload, Storage, Claid, or Sharp logic.
|
*/

import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  type DocumentData,
} from "firebase/firestore";

import {
  db,
} from "@/lib/firebase";

import type {
  ProductGalleryImage,
  ProductImageStatus,
  ProductImageVariants,
} from "@/types/product";

/*
|--------------------------------------------------------------------------
| Map Image Variants
|--------------------------------------------------------------------------
*/

function mapImageVariants(
  value: unknown
): ProductImageVariants | undefined {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return undefined;
  }

  return value as
    ProductImageVariants;
}

/*
|--------------------------------------------------------------------------
| Map Gallery Image
|--------------------------------------------------------------------------
*/

function mapGalleryImage(
  imageId: string,
  data: DocumentData
): ProductGalleryImage {
  return {
    id:
      imageId,

    altText:
      typeof data.altText ===
        "string"
        ? data.altText
        : "",

    position:
      typeof data.position ===
        "number"
        ? data.position
        : 0,

    isPrimary:
      data.role === "front" ||
      data.isPrimary === true,

    status:
      typeof data.status ===
        "string"
        ? data.status as
            ProductImageStatus
        : "none",

    imageUrl:
      typeof data.imageUrl ===
        "string"
        ? data.imageUrl
        : "",

    imageVariants:
      mapImageVariants(
        data.imageVariants
      ),

    originalImagePath:
      typeof data.originalImagePath ===
        "string"
        ? data.originalImagePath
        : null,

    optimizedImagePath:
      typeof data.optimizedImagePath ===
        "string"
        ? data.optimizedImagePath
        : null,

    imageError:
      typeof data.imageError ===
        "string"
        ? data.imageError
        : null,

    createdAt:
      data.createdAt
        ?.toDate?.()
        ?.toISOString?.(),

    updatedAt:
      data.updatedAt
        ?.toDate?.()
        ?.toISOString?.(),
  };
}

/*
|--------------------------------------------------------------------------
| Product Gallery Service
|--------------------------------------------------------------------------
*/

export const productGalleryService = {
  /*
  |--------------------------------------------------------------------------
  | Get Ready Product Images
  |--------------------------------------------------------------------------
  |
  | Only ready images are returned to customers.
  |
  | Front is position 0.
  | Back is position 1.
  |
  */

  async getProductImages(
    productId: string
  ): Promise<
    ProductGalleryImage[]
  > {
    if (!productId.trim()) {
      return [];
    }

    const imagesQuery =
      query(
        collection(
          db,
          "products",
          productId,
          "images"
        ),

        where(
          "status",
          "==",
          "ready"
        ),

        orderBy(
          "position",
          "asc"
        )
      );

    const snapshot =
      await getDocs(
        imagesQuery
      );

    return snapshot.docs.map(
      (imageDocument) =>
        mapGalleryImage(
          imageDocument.id,
          imageDocument.data()
        )
    );
  },

  /*
|--------------------------------------------------------------------------
| Get All Product Images
|--------------------------------------------------------------------------
|
| Used by the store-owner Edit Product page.
|
| Unlike the customer method, this returns images in every processing state:
|
| - uploading
| - processing
| - enhancing
| - ready
| - failed
|
| Sorting happens in memory so no additional Firestore index is required.
|
*/

async getAllProductImages(
  productId: string
): Promise<
  ProductGalleryImage[]
> {
  if (!productId.trim()) {
    return [];
  }

  const snapshot =
    await getDocs(
      collection(
        db,
        "products",
        productId,
        "images"
      )
    );

  return snapshot.docs
    .map(
      (imageDocument) =>
        mapGalleryImage(
          imageDocument.id,
          imageDocument.data()
        )
    )
    .sort(
      (
        firstImage,
        secondImage
      ) =>
        firstImage.position -
        secondImage.position
    );
},
  /*
  |--------------------------------------------------------------------------
  | Get Front Image
  |--------------------------------------------------------------------------
  */

  async getFrontImage(
    productId: string
  ): Promise<
    ProductGalleryImage | null
  > {
    const images =
      await this.getProductImages(
        productId
      );

    return (
      images.find(
        (image) =>
          image.isPrimary
      ) ??
      images[0] ??
      null
    );
  },

  /*
  |--------------------------------------------------------------------------
  | Get Back Image
  |--------------------------------------------------------------------------
  */

  async getBackImage(
    productId: string
  ): Promise<
    ProductGalleryImage | null
  > {
    const images =
      await this.getProductImages(
        productId
      );

    return (
      images.find(
        (image) =>
          !image.isPrimary
      ) ??
      null
    );
  },
};
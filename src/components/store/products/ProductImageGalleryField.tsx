"use client";

/*
|--------------------------------------------------------------------------
| Product Image Gallery Field
|--------------------------------------------------------------------------
|
| Handles the two customer-facing product images.
|
| Front Image
| • Used throughout the marketplace
| • Search
| • Store page
| • Cart
| • Checkout
|
| Back Image
| • Used only on the Product Details page
|
| This component contains no Firestore or Storage logic.
|
| It supports:
|
| • New image selection
| • Existing processed image previews
| • Image replacement
| • Existing image removal
|
*/

import Image from "next/image";

import {
  RefreshCw,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";

import type {
  ChangeEvent,
} from "react";

import type {
  ProductGalleryImageSelection,
  ProductImageRole,
} from "@/types/productForm";

/*
|--------------------------------------------------------------------------
| Props
|--------------------------------------------------------------------------
*/

interface ProductImageGalleryFieldProps {
  images:
    ProductGalleryImageSelection[];

  onChange: (
    images:
      ProductGalleryImageSelection[]
  ) => void;

  disabled?: boolean;
}

/*
|--------------------------------------------------------------------------
| Image Field Configuration
|--------------------------------------------------------------------------
*/

interface ImageRoleDefinition {
  role:
    ProductImageRole;

  title:
    string;

  description:
    string;

  required:
    boolean;
}

const IMAGE_ROLES:
ImageRoleDefinition[] = [
  {
    role:
      "front",

    title:
      "Front Image",

    description:
      "Main image customers see throughout the marketplace.",

    required:
      true,
  },

  {
    role:
      "back",

    title:
      "Back Image",

    description:
      "Nutrition facts, ingredients, or rear label.",

    required:
      false,
  },
];

/*
|--------------------------------------------------------------------------
| Component
|--------------------------------------------------------------------------
*/

export function ProductImageGalleryField({
  images,
  onChange,
  disabled = false,
}: ProductImageGalleryFieldProps) {
  /*
  |--------------------------------------------------------------------------
  | Find Image By Role
  |--------------------------------------------------------------------------
  */

  function getImage(
    role:
      ProductImageRole
  ):
  ProductGalleryImageSelection | undefined {
    return images.find(
      (image) =>
        image.role === role &&
        image.markedForRemoval !==
          true
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Select Or Replace Image
  |--------------------------------------------------------------------------
  */

  function uploadImage(
    role:
      ProductImageRole,

    event:
      ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    const currentImage =
      images.find(
        (image) =>
          image.role === role
      );

    /*
     * Release an older temporary preview URL before replacing it.
     *
     * Firebase URLs must not be revoked, so only blob URLs are released.
     */

    if (
      currentImage?.previewUrl
        .startsWith(
          "blob:"
        )
    ) {
      URL.revokeObjectURL(
        currentImage.previewUrl
      );
    }

    const previewUrl =
      URL.createObjectURL(
        file
      );

    const replacement:
    ProductGalleryImageSelection = {
      role,

      /*
       * Preserve the existing document ID during replacement.
       *
       * The Edit Product page can later decide whether to reuse that document
       * or replace it with a new gallery image ID.
       */
      existingImageId:
        currentImage
          ?.existingImageId ??
        null,

      file,

      previewUrl,

      markedForRemoval:
        false,
    };

    onChange([
      ...images.filter(
        (image) =>
          image.role !== role
      ),

      replacement,
    ]);

    /*
     * Reset the file input so selecting the same file again still triggers
     * onChange.
     */

    event.target.value =
      "";
  }

  /*
  |--------------------------------------------------------------------------
  | Remove Image
  |--------------------------------------------------------------------------
  |
  | New unsaved image:
  | Remove it from the form state entirely.
  |
  | Existing processed image:
  | Preserve its document ID and mark it for deletion during submission.
  |
  */

  function removeImage(
    role:
      ProductImageRole
  ) {
    const currentImage =
      images.find(
        (image) =>
          image.role === role
      );

    if (!currentImage) {
      return;
    }

    if (
      currentImage.previewUrl
        .startsWith(
          "blob:"
        )
    ) {
      URL.revokeObjectURL(
        currentImage.previewUrl
      );
    }

    /*
     * Existing Firestore gallery image.
     */

    if (
      currentImage.existingImageId
    ) {
      const removedImage:
      ProductGalleryImageSelection = {
        ...currentImage,

        file:
          null,

        previewUrl:
          "",

        markedForRemoval:
          true,
      };

      onChange([
        ...images.filter(
          (image) =>
            image.role !== role
        ),

        removedImage,
      ]);

      return;
    }

    /*
     * New unsaved image.
     */

    onChange(
      images.filter(
        (image) =>
          image.role !== role
      )
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Restore Removed Existing Image
  |--------------------------------------------------------------------------
  |
  | The original Firebase URL is not currently preserved after removal, so the
  | form cannot visually restore it without reloading the Edit Product page.
  |
  | This action simply removes the deletion request. ProductForm will reload
  | the existing gallery state in the next integration step.
  |
  */

  function undoRemoval(
    role:
      ProductImageRole
  ) {
    const currentImage =
      images.find(
        (image) =>
          image.role === role
      );

    if (
      !currentImage ||
      !currentImage.existingImageId
    ) {
      return;
    }

    onChange(
      images.filter(
        (image) =>
          image.role !== role
      )
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Render
  |--------------------------------------------------------------------------
  */

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
      {IMAGE_ROLES.map(
        (
          imageDefinition
        ) => {
          const image =
            getImage(
              imageDefinition.role
            );

          const removedImage =
            images.find(
              (candidate) =>
                candidate.role ===
                  imageDefinition.role &&
                candidate
                  .markedForRemoval ===
                  true
            );

          return (
            <div
              key={
                imageDefinition.role
              }
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="block text-xs font-semibold text-gray-700">
                  {
                    imageDefinition.title
                  }

                  {imageDefinition.required && (
                    <span className="ml-1 text-red-500">
                      *
                    </span>
                  )}
                </label>

                <span className="text-[10px] text-gray-400">
                  {imageDefinition.role ===
                  "front"
                    ? "Primary"
                    : "Optional"}
                </span>
              </div>

              <p className="mb-2 hidden text-[11px] leading-snug text-gray-500 lg:block">
                {
                  imageDefinition.description
                }
              </p>

              {image ? (
                /*
                |--------------------------------------------------------------------------
                | Selected Or Existing Image
                |--------------------------------------------------------------------------
                */

                <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                  <Image
                    src={
                      image.previewUrl
                    }
                    alt={
                      imageDefinition.title
                    }
                    fill
                    className="object-contain"
                  />

                  {image.file ? (
                    <span className="absolute bottom-1.5 left-1.5 rounded-full bg-blue-600 px-2 py-1 text-[9px] font-semibold text-white shadow-sm">
                      New image
                    </span>
                  ) : (
                    <span className="absolute bottom-1.5 left-1.5 rounded-full bg-green-600 px-2 py-1 text-[9px] font-semibold text-white shadow-sm">
                      Current image
                    </span>
                  )}

                  <div className="absolute right-1.5 top-1.5 flex gap-1.5">
                    {/*
                     * Replacement button.
                     */}

                    <label
                      className={`flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-700 shadow-md transition hover:bg-orange-500 hover:text-white ${
                        disabled
                          ? "cursor-not-allowed opacity-50"
                          : "cursor-pointer"
                      }`}
                      aria-label={`Replace ${imageDefinition.title}`}
                    >
                      <RefreshCw className="h-4 w-4" />

                      <input
                        hidden
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                        capture="environment"
                        disabled={
                          disabled
                        }
                        onChange={(
                          event
                        ) =>
                          uploadImage(
                            imageDefinition.role,
                            event
                          )
                        }
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() =>
                        removeImage(
                          imageDefinition.role
                        )
                      }
                      disabled={
                        disabled
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white shadow-md transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Remove ${imageDefinition.title}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : removedImage ? (
                /*
                |--------------------------------------------------------------------------
                | Existing Image Marked For Removal
                |--------------------------------------------------------------------------
                */

                <div className="flex aspect-[4/3] flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 text-center">
                  <X className="mb-2 h-7 w-7 text-red-400" />

                  <p className="text-xs font-semibold text-red-700">
                    Image will be removed
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      undoRemoval(
                        imageDefinition.role
                      )
                    }
                    disabled={
                      disabled
                    }
                    className="mt-3 inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-[11px] font-medium text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />

                    Cancel removal
                  </button>
                </div>
              ) : (
                /*
                |--------------------------------------------------------------------------
                | Empty Upload Field
                |--------------------------------------------------------------------------
                */

                <label
                  className={`flex aspect-[4/3] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 transition hover:border-orange-500 ${
                    disabled
                      ? "cursor-not-allowed opacity-60"
                      : "cursor-pointer"
                  }`}
                >
                  <Upload className="mb-1.5 h-7 w-7 text-gray-400" />

                  <p className="text-xs font-medium text-gray-600">
                    Upload{" "}
                    {
                      imageDefinition.title
                    }
                  </p>

                  <p className="mt-1 px-2 text-center text-[10px] text-gray-400">
                    JPG, PNG, WebP, or HEIC
                  </p>

                  <input
                    hidden
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    capture="environment"
                    disabled={
                      disabled
                    }
                    onChange={(
                      event
                    ) =>
                      uploadImage(
                        imageDefinition.role,
                        event
                      )
                    }
                  />
                </label>
              )}
            </div>
          );
        }
      )}
    </div>
  );
}
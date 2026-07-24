"use client";

/*
|--------------------------------------------------------------------------
| Add Product Page
|--------------------------------------------------------------------------
|
| Resolves the signed-in store and creates products through productService.
|
| This page contains no direct Firestore access.
|
*/

import type {
  ProductFormSubmission,
} from "@/types/productFormSubmission";

import {
  useEffect,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import Link from "next/link";

import {
  ArrowLeft,
} from "lucide-react";

import {
  onAuthStateChanged,
} from "firebase/auth";

import {
  auth,
} from "@/lib/firebase";

import {
  productService,
} from "@/services/product/productService";

import {
  userService,
} from "@/services/user/userService";

import {
  ProductForm,
} from "@/components/store/products/ProductForm";

import {
  BrandedLoader,
} from "@/components/ui/BrandedLoader";

import {useSuccessToast} from "@/context/SuccessToastContext";

import {
  productGalleryImageService,
} from "@/services/product/productGalleryImageService";

import {
  validateProductImageFile,
} from "@/services/product/productImageService";
/*
|--------------------------------------------------------------------------
| Page
|--------------------------------------------------------------------------
*/

export default function AddProductPage() {
  const {showSuccess} = useSuccessToast();
  const router =
    useRouter();

  const [
    storeId,
    setStoreId,
  ] = useState<string | null>(
    null
  );

  const [
    loadingStore,
    setLoadingStore,
  ] = useState(true);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null
  );

  const [
    formKey,
    setFormKey,
  ] = useState(0);

  const [
    success,
    setSuccess,
  ] = useState<string | null>(null);

  /*
  |--------------------------------------------------------------------------
  | Resolve Store
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (user) => {
          if (!user) {
            router.replace("/login");
            return;
          }

          try {
            setLoadingStore(true);
            setError(null);

            const resolvedStoreId =
              await userService.getStoreId(
                user.uid
              );

            if (!resolvedStoreId) {
              router.replace(
                "/store/create"
              );

              return;
            }

            setStoreId(
              resolvedStoreId
            );
          } catch (loadError) {
            console.error(
              "Error resolving store:",
              loadError
            );

            setError(
              "Failed to load your store."
            );
          } finally {
            setLoadingStore(false);
          }
        }
      );

    return unsubscribe;
  }, [router]);

  useEffect(() => {
    if (!success) {
      return;
    }

    const timeoutId = window.setTimeout(
      () => setSuccess(null),
      5000
    );

    return () => window.clearTimeout(timeoutId);
  }, [success]);

 /*
|--------------------------------------------------------------------------
| Create Product
|--------------------------------------------------------------------------
*/

const handleSubmit =
async ({
  data,
  imageFiles,
}: ProductFormSubmission) => {
  if (!storeId) {
    setError(
      "Store not found."
    );

    return;
  }

  const frontImage =
    imageFiles.find(
      (image) =>
        image.isPrimary
    );

  const backImage =
    imageFiles.find(
      (image) =>
        !image.isPrimary
    );

  const backImageFile =
    backImage?.file;

  if (!frontImage?.file) {
    setError(
      "A front product image is required."
    );

    return;
  }

  if (backImage && !backImageFile) {
    setError(
      "Please choose a valid back product image or remove it."
    );

    return;
  }

  try {
    setSubmitting(
      true
    );

    setError(
      null
    );

    setSuccess(
      null
    );

    /*
    |--------------------------------------------------------------------------
    | Validate Selected Images
    |--------------------------------------------------------------------------
    */

    validateProductImageFile(
      frontImage.file
    );

    if (backImage && backImageFile) {
      validateProductImageFile(
        backImageFile
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Create Parent Product
    |--------------------------------------------------------------------------
    |
    | The parent product keeps the primary front-image fields used by:
    |
    | - Store cards
    | - Search
    | - Cart
    | - Checkout
    | - Orders
    |
    | The background Function fills those fields after the front image is
    | processed.
    |
    */

    const productId =
      await productService.createProduct(
        {
          storeId,

          name:
            data.name,

          description:
            data.description,

          category:
            data.category,

          brand:
            data.brand,

          price:
            data.price,

          stock:
            data.stock,

          imageUrl:
            "",

          imageVariants:
            undefined,

          images:
            undefined,

          primaryImageId:
            frontImage.id,

          sku:
            data.sku,

          isAvailable:
            data.isAvailable,

          featured:
            data.featured,

          size:
            data.size,

          reviewCount:
            0,

          soldCount:
            0,

          promotion:
            data.promotion,

          imageStatus:
            "uploading",

          originalImagePath:
            undefined,

          optimizedImagePath:
            undefined,

          imageError:
            null,
        }
      );

    /*
    |--------------------------------------------------------------------------
    | Upload Front And Back Images
    |--------------------------------------------------------------------------
    |
    | Both original files upload concurrently.
    |
    | Front:
    | - Required
    | - Primary
    | - Mirrored onto the parent product when processing finishes
    |
    | Back:
    | - Optional
    | - Stored only in the gallery subcollection
    |
    */

    const uploadTasks = [
      productGalleryImageService
        .uploadGalleryImage({
          productId,

          storeId,

          imageId:
            frontImage.id,

          role:
            "front",

          file:
            frontImage.file,

          altText:
            frontImage.altText,

          position:
            0,
        }),
    ];

    if (backImage && backImageFile) {
      uploadTasks.push(
        productGalleryImageService
          .uploadGalleryImage({
            productId,

            storeId,

            imageId:
              backImage.id,

            role:
              "back",

            file:
            backImageFile,

            altText:
              backImage.altText,

            position:
              1,
          })
      );
    }

    await Promise.all(
      uploadTasks
    );

    /*
    |--------------------------------------------------------------------------
    | Reset Form
    |--------------------------------------------------------------------------
    */

    setFormKey(
      (currentKey) =>
        currentKey + 1
    );

    setSuccess(
      "Product added. Image processing will continue in the background."
    );

    showSuccess(
      "Product added successfully."
    );
  } catch (submitError) {
    console.error(
      "Error adding product:",
      submitError
    );

    setError(
      submitError instanceof Error
        ? submitError.message
        : "Failed to add product. Please try again."
    );
  } finally {
    setSubmitting(
      false
    );
  }
};

  /*
  |--------------------------------------------------------------------------
  | Loading
  |--------------------------------------------------------------------------
  */

  if (loadingStore) {
    return (
      <BrandedLoader
        message="Loading Store"
      />
    );
  }

  if (!storeId) {
    return null;
  }

  /*
  |--------------------------------------------------------------------------
  | Page
  |--------------------------------------------------------------------------
  */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/store/products"
          className="rounded-xl p-2 transition hover:bg-gray-100"
          aria-label="Back to products"
        >
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </Link>

        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Add Product
          </h1>

          <p className="text-sm text-gray-500">
            Add a new product to your
            store
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-600">
            {error}
          </p>
        </div>
      )}

      {/* Form */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <ProductForm
          key={formKey}
          onSubmit={handleSubmit}
          loading={submitting}
          submitLabel="Add Product"
          successMessage={success}
        />
      </div>
    </div>
  );
}

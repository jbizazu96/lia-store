"use client";

/*
|--------------------------------------------------------------------------
| Edit Product Page
|--------------------------------------------------------------------------
|
| Loads one product through productService and saves changes using the
| shared ProductFormData model.
|
| Direct Firestore access does not belong in this page.
|
*/

import {
  use,
  useEffect,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import Link from "next/link";

import {
  ArrowLeft,
  Trash2,
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
  BrandedLoader,
} from "@/components/ui/BrandedLoader";

import {
  ProductForm,
} from "@/components/store/products/ProductForm";

import type {
  Product,
} from "@/types/product";

import type {
  ProductFormSubmission,
} from "@/types/productFormSubmission";

import {
  productImageService,
} from "@/services/product/productImageService";

/*
|--------------------------------------------------------------------------
| Props
|--------------------------------------------------------------------------
*/

interface EditProductPageProps {
  params: Promise<{
    productId: string;
  }>;
}

/*
|--------------------------------------------------------------------------
| Page
|--------------------------------------------------------------------------
*/

export default function EditProductPage({
  params,
}: EditProductPageProps) {
  const {
    productId,
  } = use(params);

  const router =
    useRouter();

  const [
    product,
    setProduct,
  ] = useState<Product | null>(
    null
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    deleting,
    setDeleting,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null
  );

  /*
  |--------------------------------------------------------------------------
  | Load Product
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    let isMounted = true;

    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (user) => {
          if (!user) {
            router.replace("/login");
            return;
          }

          try {
            setLoading(true);
            setError(null);

            const storeId =
              await userService.getStoreId(
                user.uid
              );

            if (!storeId) {
              router.replace(
                "/store/create"
              );

              return;
            }

            const loadedProduct =
              await productService.getProduct(
                productId
              );

            if (!loadedProduct) {
              if (isMounted) {
                setProduct(null);

                setError(
                  "Product not found."
                );
              }

              return;
            }

            /*
             * A store owner may only edit products belonging to their store.
             */

            if (
              loadedProduct.storeId !==
              storeId
            ) {
              if (isMounted) {
                setProduct(null);

                setError(
                  "You do not have permission to edit this product."
                );
              }

              return;
            }

            if (isMounted) {
              setProduct(
                loadedProduct
              );
            }
          } catch (loadError) {
            console.error(
              "Error loading product:",
              loadError
            );

            if (isMounted) {
              setProduct(null);

              setError(
                "Failed to load product."
              );
            }
          } finally {
            if (isMounted) {
              setLoading(false);
            }
          }
        }
      );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [
    productId,
    router,
  ]);

  /*
  |--------------------------------------------------------------------------
  | Save Product
  |--------------------------------------------------------------------------
  */

  const handleSubmit =
  async ({
    data,
    imageFile,
  }: ProductFormSubmission) => {
    if (!product) {
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      /*
      |--------------------------------------------------------------------------
      | Update Product Data
      |--------------------------------------------------------------------------
      */

      await productService.updateProduct(
        product.id,
        {
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

          sku:
            data.sku,

          imageUrl:
            imageFile
              ? product.imageUrl
              : data.imageUrl,

          isAvailable:
            data.isAvailable,

          featured:
            data.featured,

          size:
            data.size,

          promotion:
            data.promotion,

          /*
           * A new upload will move the status through uploading and
           * processing inside productImageService.
           */

          imageStatus:
            imageFile
              ? "uploading"
              : product.imageStatus,
        }
      );

      /*
      |--------------------------------------------------------------------------
      | Upload New Original Image
      |--------------------------------------------------------------------------
      |
      | The existing image remains visible until the background Function
      | finishes processing the replacement.
      |
      */

      if (imageFile) {
        await productImageService
          .uploadOriginalImage({
            productId:
              product.id,

            storeId:
              product.storeId,

            file:
              imageFile,
          });
      }

      router.push(
        "/store/products"
      );
    } catch (submitError) {
      console.error(
        "Error updating product:",
        submitError
      );

      setError(
        "Failed to update product. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | Delete Product
  |--------------------------------------------------------------------------
  */

  const handleDelete =
    async () => {
      if (!product) {
        return;
      }

      const confirmed =
        window.confirm(
          "Are you sure you want to delete this product? This action cannot be undone."
        );

      if (!confirmed) {
        return;
      }

      try {
        setDeleting(true);
        setError(null);

        await productService.deleteProduct(
          product.id
        );

        router.push(
          "/store/products"
        );
      } catch (deleteError) {
        console.error(
          "Error deleting product:",
          deleteError
        );

        setError(
          "Failed to delete product. Please try again."
        );
      } finally {
        setDeleting(false);
      }
    };

  /*
  |--------------------------------------------------------------------------
  | Loading
  |--------------------------------------------------------------------------
  */

  if (loading) {
    return (
      <BrandedLoader
        message="Loading Product Details"
      />
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Error / Missing Product
  |--------------------------------------------------------------------------
  */

  if (!product) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">
          {error ??
            "Product not found."}
        </p>

        <Link
          href="/store/products"
          className="mt-4 inline-block text-orange-600 hover:text-orange-700"
        >
          Back to Products
        </Link>
      </div>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Page
  |--------------------------------------------------------------------------
  */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
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
              Edit Product
            </h1>

            <p className="text-sm text-gray-500">
              {product.name}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDelete}
          disabled={
            deleting ||
            submitting
          }
          className="flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Delete product"
        >
          <Trash2 className="h-4 w-4" />

          {deleting
            ? "Deleting..."
            : "Delete"}
        </button>
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
          initialData={product}
          onSubmit={handleSubmit}
          loading={
            submitting ||
            deleting
          }
          submitLabel="Save Changes"
        />
      </div>
    </div>
  );
}

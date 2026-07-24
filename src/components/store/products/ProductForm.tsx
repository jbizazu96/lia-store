"use client";

/*
|--------------------------------------------------------------------------
| Product Form
|--------------------------------------------------------------------------
|
| Shared form used by:
|
| - Add Product
| - Edit Product
|
| Responsibilities:
|
| - Collect product details
| - Manage front and back image selection
| - Validate form values
| - Normalize data before submission
|
| This component contains no Firestore or Storage logic.
|
*/

import {
  useEffect,
  useState,
} from "react";

import type {
  FormEvent,
} from "react";

import Link from "next/link";

import {
  DollarSign,
  Package,
  Ruler,
  Save,
  Star,
} from "lucide-react";

import {
  ProductImageGalleryField,
} from "@/components/store/products/ProductImageGalleryField";

import {
  ProductPromotionSection,
} from "@/components/store/products/ProductPromotionSection";

import {
  PRODUCT_CATEGORIES,
} from "@/config/productCategories";

import {
  PRODUCT_SIZE_UNITS,
} from "@/config/productFormOptions";

import {
  useConfirmation,
} from "@/context/ConfirmationContext";

import {
  useUnsavedChanges,
} from "@/hooks/useUnsavedChanges";

import type {
  ProductFormData,
  ProductGalleryImageSelection,
} from "@/types/productForm";

import type {
  ProductFormSubmission,
} from "@/types/productFormSubmission";

/*
|--------------------------------------------------------------------------
| Props
|--------------------------------------------------------------------------
*/

interface ProductFormProps {
  initialData?:
    | Partial<ProductFormData>
    | null;

  initialImages?:
    ProductGalleryImageSelection[];

  onSubmit: (
    submission: ProductFormSubmission
  ) => void | Promise<void>;

  loading: boolean;

  submitLabel: string;

  successMessage?: string | null;
}

/*
|--------------------------------------------------------------------------
| Empty Form
|--------------------------------------------------------------------------
*/

const EMPTY_FORM_DATA:
ProductFormData = {
  name: "",

  description: "",

  category: "",

  brand: "",

  price: 0,

  stock: 0,

  sku: "",

  /*
   * Legacy primary image URL.
   *
   * Existing products may still use this field.
   */
  imageUrl: "",

  isAvailable: true,

  featured: false,

  size: null,

  promotion: null,
};

/*
|--------------------------------------------------------------------------
| Component
|--------------------------------------------------------------------------
*/

export function ProductForm({
  initialData,
  initialImages = [],
  onSubmit,
  loading,
  submitLabel,
  successMessage,
}: ProductFormProps) {
  const {
    confirm,
  } = useConfirmation();

  const [
    hasUnsavedChanges,
    setHasUnsavedChanges,
  ] = useState(false);

  useUnsavedChanges(
    hasUnsavedChanges
  );

  /*
  |--------------------------------------------------------------------------
  | Product Form State
  |--------------------------------------------------------------------------
  */

  const [
    formData,
    setFormData,
  ] = useState<ProductFormData>(
    EMPTY_FORM_DATA
  );

  /*
   * String states allow numeric inputs to become temporarily empty while the
   * store owner is typing.
   */

  const [
    priceInput,
    setPriceInput,
  ] = useState("");

  const [
    stockInput,
    setStockInput,
  ] = useState("");

  const [
    sizeValueInput,
    setSizeValueInput,
  ] = useState("");

  const [
    sizeUnit,
    setSizeUnit,
  ] = useState("each");

  /*
  |--------------------------------------------------------------------------
  | New Gallery Images
  |--------------------------------------------------------------------------
  |
  | Front image:
  | - Required for new products
  | - Always primary
  |
  | Back image:
  | - Optional
  | - Used on the product-details page
  |
  */

  const [
    imageFiles,
    setImageFiles,
  ] = useState<
    ProductGalleryImageSelection[]
  >([]);

  /*
  |--------------------------------------------------------------------------
  | Load Initial Product Data
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (!initialData) {
      return;
    }

    const price =
      initialData.price ?? 0;

    const stock =
      initialData.stock ?? 0;

    const size =
      initialData.size ?? null;

    setFormData({
      ...EMPTY_FORM_DATA,
      ...initialData,

      price,

      stock,

      size,

      promotion:
        initialData.promotion ??
        null,
    });

    setPriceInput(
      price > 0
        ? price.toString()
        : ""
    );

    setStockInput(
      stock > 0
        ? stock.toString()
        : ""
    );

    setSizeValueInput(
      size &&
      size.value > 0
        ? size.value.toString()
        : ""
    );

    setSizeUnit(
      size?.unit ??
      "each"
    );

    /*
    |--------------------------------------------------------------------------
    | Load Existing Gallery Images
    |--------------------------------------------------------------------------
    |
    | Used by the Edit Product page.
    |
    */

    setImageFiles(
      initialImages
    );

  }, [initialData]);

  /*
  |--------------------------------------------------------------------------
  | Generic Field Update
  |--------------------------------------------------------------------------
  */

  const updateField = <
    Key extends keyof ProductFormData
  >(
    field: Key,
    value: ProductFormData[Key]
  ) => {
    setHasUnsavedChanges(
      true
    );

    setFormData(
      (current) => ({
        ...current,

        [field]:
          value,
      })
    );
  };

  /*
  |--------------------------------------------------------------------------
  | Gallery Update
  |--------------------------------------------------------------------------
  */

  const handleGalleryChange = (
    nextImages:
      ProductGalleryImageSelection[]
  ) => {
    setImageFiles(
      nextImages
    );

    setHasUnsavedChanges(
      true
    );
  };

  /*
  |--------------------------------------------------------------------------
  | Pricing
  |--------------------------------------------------------------------------
  */

  const handlePriceChange = (
    value: string
  ) => {
    setPriceInput(
      value
    );

    const parsedPrice =
      Number.parseFloat(
        value
      );

    updateField(
      "price",
      Number.isFinite(
        parsedPrice
      )
        ? parsedPrice
        : 0
    );
  };

  /*
  |--------------------------------------------------------------------------
  | Stock
  |--------------------------------------------------------------------------
  */

  const handleStockChange = (
    value: string
  ) => {
    setStockInput(
      value
    );

    const parsedStock =
      Number.parseInt(
        value,
        10
      );

    updateField(
      "stock",
      Number.isFinite(
        parsedStock
      )
        ? parsedStock
        : 0
    );
  };

  /*
  |--------------------------------------------------------------------------
  | Size
  |--------------------------------------------------------------------------
  */

  const handleSizeValueChange = (
    value: string
  ) => {
    setSizeValueInput(
      value
    );

    const parsedValue =
      Number.parseFloat(
        value
      );

    if (
      !Number.isFinite(
        parsedValue
      ) ||
      parsedValue <= 0
    ) {
      updateField(
        "size",
        null
      );

      return;
    }

    updateField(
      "size",
      {
        value:
          parsedValue,

        unit:
          sizeUnit,
      }
    );
  };

  const handleSizeUnitChange = (
    value: string
  ) => {
    setSizeUnit(
      value
    );

    const parsedValue =
      Number.parseFloat(
        sizeValueInput
      );

    if (
      Number.isFinite(
        parsedValue
      ) &&
      parsedValue > 0
    ) {
      updateField(
        "size",
        {
          value:
            parsedValue,

          unit:
            value,
        }
      );
    }
  };

  /*
  |--------------------------------------------------------------------------
  | Submit
  |--------------------------------------------------------------------------
  */

  const handleSubmit = async (
    event:
      FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    /*
    |--------------------------------------------------------------------------
    | Product Validation
    |--------------------------------------------------------------------------
    */

    if (
      !formData.name.trim()
    ) {
      alert(
        "Product name is required."
      );

      return;
    }

    if (
      !formData.category
    ) {
      alert(
        "Please select a category."
      );

      return;
    }

    if (
      formData.price <= 0
    ) {
      alert(
        "Regular price must be greater than zero."
      );

      return;
    }

    if (
      formData.stock < 0
    ) {
      alert(
        "Stock cannot be negative."
      );

      return;
    }

    const frontImage =
      imageFiles.find(
        (image) =>
          image.role ===
          "front"
      );

    /*
     * New products require a front image.
     *
     * Existing products may keep their current image when no new front image
     * is selected.
     */

    if (
      !initialData &&
      !frontImage
    ) {
      alert(
        "Please upload the front product image."
      );

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | Edit Confirmation
    |--------------------------------------------------------------------------
    */

    if (initialData) {
      const confirmed =
        await confirm({
          title:
            "Save product changes?",

          message:
            "Your product updates will be visible after saving.",

          confirmLabel:
            "Save changes",

          cancelLabel:
            "Keep editing",
        });

      if (!confirmed) {
        return;
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Normalize Product Data
    |--------------------------------------------------------------------------
    */

    const normalizedData:
    ProductFormData = {
      ...formData,

      name:
        formData.name.trim(),

      description:
        formData.description.trim(),

      brand:
        formData.brand.trim(),

      sku:
        formData.sku.trim(),

      size:
        formData.size &&
        formData.size.value > 0
          ? formData.size
          : null,

      promotion:
        formData.promotion,
    };

    /*
    |--------------------------------------------------------------------------
    | Normalize Gallery Submission
    |--------------------------------------------------------------------------
    |
    | Front:
    | - Position 0
    | - Primary
    |
    | Back:
    | - Position 1
    | - Secondary
    |
    */

    const gallerySubmission =
  imageFiles
    .map(
      (image) => {
        const position: 0 | 1 =
          image.role === "front"
            ? 0
            : 1;

        return {
         
          /*
          * Unchanged existing images keep their document ID.
          *
          * Replacement files receive a new document ID so the old image and its
          * Storage variants remain available until the replacement upload succeeds.
          */
          id:
            image.file
              ? crypto.randomUUID()
              : image.existingImageId ??
                crypto.randomUUID(),
          

          existingImageId:
            image.existingImageId,

          file:
            image.file,

          altText:
            image.role === "front"
              ? "Front view of product"
              : "Back label of product",

          position,

          isPrimary:
            image.role === "front",

          markedForRemoval:
            image.markedForRemoval === true,
        };
      }
    )
        .sort(
          (
            firstImage,
            secondImage
          ) =>
            firstImage.position -
            secondImage.position
        );

    /*
     * Clear the navigation warning immediately before submission.
     */

    setHasUnsavedChanges(
      false
    );

    await onSubmit({
      data:
        normalizedData,

      imageFiles:
        gallerySubmission,

      /*
       * Temporary compatibility field.
       *
       * Existing add/edit pages still use imageFile while they are migrated
       * to upload the complete gallery.
       */
      imageFile:
        frontImage?.file ??
        null,
    });
  };

  /*
  |--------------------------------------------------------------------------
  | Form
  |--------------------------------------------------------------------------
  */

  return (
    <form
      onSubmit={
        handleSubmit
      }
      className="space-y-6"
    >
      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start">
      {/*
      |--------------------------------------------------------------------------
      | Product Images
      |--------------------------------------------------------------------------
      */}

      <aside className="lg:sticky lg:top-6">
        <ProductImageGalleryField
          images={
            imageFiles
          }
          onChange={
            handleGalleryChange
          }
          disabled={
            loading
          }
        />
      </aside>

      <div className="space-y-6">

      {/*
      |--------------------------------------------------------------------------
      | Product Fields
      |--------------------------------------------------------------------------
      */}

      <div className="space-y-5 rounded-2xl border border-gray-100 bg-white p-5">
        {/* Name and Category */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Product Name *
            </label>

            <input
              type="text"
              value={
                formData.name
              }
              onChange={(
                event
              ) =>
                updateField(
                  "name",
                  event.target.value
                )
              }
              disabled={
                loading
              }
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 focus:border-transparent focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="e.g., Jollof Rice Mix"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Category *
            </label>

            <select
              value={
                formData.category
              }
              onChange={(
                event
              ) =>
                updateField(
                  "category",
                  event.target.value
                )
              }
              disabled={
                loading
              }
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
              required
            >
              <option value="">
                Select category
              </option>

              {PRODUCT_CATEGORIES.map(
                (category) => (
                  <option
                    key={
                      category.value
                    }
                    value={
                      category.value
                    }
                  >
                    {category.label}
                  </option>
                )
              )}
            </select>
          </div>
        </div>

        {/* Brand and SKU */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Brand
            </label>

            <input
              type="text"
              value={
                formData.brand
              }
              onChange={(
                event
              ) =>
                updateField(
                  "brand",
                  event.target.value
                )
              }
              disabled={
                loading
              }
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="e.g., Maggi"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              SKU
            </label>

            <input
              type="text"
              value={
                formData.sku
              }
              onChange={(
                event
              ) =>
                updateField(
                  "sku",
                  event.target.value
                )
              }
              disabled={
                loading
              }
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 uppercase focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="e.g., MAG-JOL-001"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Description
          </label>

          <textarea
            value={
              formData.description
            }
            onChange={(
              event
            ) =>
              updateField(
                "description",
                event.target.value
              )
            }
            disabled={
              loading
            }
            rows={3}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 focus:border-transparent focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="Describe the product..."
          />
        </div>

        {/* Price */}
        <div className="max-w-md">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Regular Price ($) *
          </label>

          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

            <input
              type="number"
              step="0.01"
              min="0"
              value={
                priceInput
              }
              onChange={(
                event
              ) =>
                handlePriceChange(
                  event.target.value
                )
              }
              disabled={
                loading
              }
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="e.g., 14.99"
              required
            />
          </div>

          <p className="mt-1 text-xs text-gray-400">
            Add a discount promotion below to show a sale price.
          </p>
        </div>

        {/* Stock and Size */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Stock Quantity *
            </label>

            <div className="relative">
              <Package className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

              <input
                type="number"
                min="0"
                step="1"
                value={
                  stockInput
                }
                onChange={(
                  event
                ) =>
                  handleStockChange(
                    event.target.value
                  )
                }
                disabled={
                  loading
                }
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="e.g., 50"
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Size Value
            </label>

            <div className="relative">
              <Ruler className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  sizeValueInput
                }
                onChange={(
                  event
                ) =>
                  handleSizeValueChange(
                    event.target.value
                  )
                }
                disabled={
                  loading
                }
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="e.g., 2"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Size Unit
            </label>

            <select
              value={
                sizeUnit
              }
              onChange={(
                event
              ) =>
                handleSizeUnitChange(
                  event.target.value
                )
              }
              disabled={
                loading
              }
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {PRODUCT_SIZE_UNITS.map(
                (unit) => (
                  <option
                    key={
                      unit.value
                    }
                    value={
                      unit.value
                    }
                  >
                    {unit.label}
                  </option>
                )
              )}
            </select>
          </div>
        </div>

        {/* Product Settings */}
        <div className="flex flex-col gap-4 border-t border-gray-200 pt-4 sm:flex-row sm:items-center sm:justify-end">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={
                formData.featured
              }
              onChange={(
                event
              ) =>
                updateField(
                  "featured",
                  event.target.checked
                )
              }
              disabled={
                loading
              }
              className="h-4 w-4 rounded text-orange-500 focus:ring-orange-500"
            />

            <Star className="h-4 w-4 text-yellow-500" />

            Featured
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={
                formData.isAvailable
              }
              onChange={(
                event
              ) =>
                updateField(
                  "isAvailable",
                  event.target.checked
                )
              }
              disabled={
                loading
              }
              className="h-4 w-4 rounded text-green-500 focus:ring-green-500"
            />

            Available
          </label>
        </div>

        {/* Promotion */}
        <ProductPromotionSection
          promotion={
            formData.promotion
          }
          onChange={(
            promotion
          ) =>
            updateField(
              "promotion",
              promotion
            )
          }
        />
      </div>

      {/* Success */}
      {successMessage && (
        <div
          role="status"
          className="rounded-xl border border-green-200 bg-green-50 px-3 py-2"
        >
          <p className="text-sm font-medium text-green-700">
            {successMessage}
          </p>
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-3 border-t border-gray-200 pt-4">
        <Link
          href="/store/products"
          className="flex-1 rounded-xl border border-gray-200 py-3 text-center font-medium text-gray-600 transition hover:bg-gray-50"
        >
          Cancel
        </Link>

        <button
          type="submit"
          disabled={
            loading
          }
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 py-3 font-semibold text-white transition hover:from-orange-600 hover:to-orange-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <>
              <Save className="h-4 w-4" />

              {submitLabel}
            </>
          )}
        </button>
      </div>
      </div>
      </div>
    </form>
  );
}

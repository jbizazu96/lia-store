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
| This component uses:
|
| - Shared ProductFormData type
| - Centralized product categories
| - Centralized size-unit options
| - Centralized promotion options
|
| It contains no Firestore logic.
|
*/

import type {
  ProductFormSubmission,
} from "@/types/productFormSubmission";

import {
  ProductPromotionSection,
} from "@/components/store/products/ProductPromotionSection";

import {
  useEffect,
  useState,
} from "react";

import type {
  ChangeEvent,
  FormEvent,
} from "react";

import {
  motion,
} from "framer-motion";

import Image from "next/image";
import Link from "next/link";

import {
  DollarSign,
  Package,
  Ruler,
  Save,
  Star,
  Upload,
  X,
} from "lucide-react";

import {
  PRODUCT_CATEGORIES,
} from "@/config/productCategories";

import {
  PRODUCT_SIZE_UNITS,
} from "@/config/productFormOptions";

import type {
  ProductFormData,
} from "@/types/productForm";

import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { useConfirmation } from "@/context/ConfirmationContext";

/*
|--------------------------------------------------------------------------
| Props
|--------------------------------------------------------------------------
*/

interface ProductFormProps {
  initialData?:
    | Partial<ProductFormData>
    | null;

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
  onSubmit,
  loading,
  submitLabel,
  successMessage,
}: ProductFormProps) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useUnsavedChanges(hasUnsavedChanges);
  const { confirm } = useConfirmation();

  /*
  |--------------------------------------------------------------------------
  | Form State
  |--------------------------------------------------------------------------
  */

  const [
    formData,
    setFormData,
  ] = useState<ProductFormData>(
    EMPTY_FORM_DATA
  );

  /*
   * String values allow number inputs to temporarily be empty while the
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

  const [
    imagePreview,
    setImagePreview,
  ] = useState("");

  const [
      imageFile,
      setImageFile,
    ] = useState<File | null>(
      null
    );

  /*
  |--------------------------------------------------------------------------
  | Load Initial Data
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
      size && size.value > 0
        ? size.value.toString()
        : ""
    );

    setSizeUnit(
      size?.unit ?? "each"
    );

    setImagePreview(
      initialData.imageUrl ?? ""
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
    setHasUnsavedChanges(true);

    setFormData(
      (current) => ({
        ...current,
        [field]: value,
      })
    );
  };

  /*
  |--------------------------------------------------------------------------
  | Image
  |--------------------------------------------------------------------------
  */

  const handleImageUpload = (
      event: ChangeEvent<HTMLInputElement>
    ) => {
      const file =
        event.target.files?.[0];

      if (!file) {
        return;
      }

      setImageFile(file);

      const previewUrl =
        URL.createObjectURL(file);

      setImagePreview(
        previewUrl
      );
    };

  const removeImage = async () => {
    const confirmed = await confirm({
      title: "Remove product image?",
      message: "This image will be removed when you save the product.",
      confirmLabel: "Remove image",
      cancelLabel: "Keep image",
      destructive: true,
    });

    if (!confirmed) {
      return;
    }
    setImageFile(null);
    setImagePreview("");

    updateField(
      "imageUrl",
      ""
    );
  };

  /*
  |--------------------------------------------------------------------------
  | Pricing
  |--------------------------------------------------------------------------
  |
  | price:
  | Regular/original product price.
  |
  */

  const handlePriceChange = (
    value: string
  ) => {
    setPriceInput(value);

    const parsedPrice =
      Number.parseFloat(value);

    updateField(
      "price",
      Number.isFinite(parsedPrice)
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
    setStockInput(value);

    const parsedStock =
      Number.parseInt(
        value,
        10
      );

    updateField(
      "stock",
      Number.isFinite(parsedStock)
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
    setSizeValueInput(value);

    const parsedValue =
      Number.parseFloat(value);

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
        value: parsedValue,
        unit: sizeUnit,
      }
    );
  };

  const handleSizeUnitChange = (
    value: string
  ) => {
    setSizeUnit(value);

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
          value: parsedValue,
          unit: value,
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
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!formData.name.trim()) {
      alert(
        "Product name is required."
      );

      return;
    }

    if (!formData.category) {
      alert(
        "Please select a category."
      );

      return;
    }

    if (formData.price <= 0) {
      alert(
        "Regular price must be greater than zero."
      );

      return;
    }

    if (formData.stock < 0) {
      alert(
        "Stock cannot be negative."
      );

      return;
    }

    const confirmed = await confirm({
      title: initialData ? "Save product changes?" : "Create product?",
      message: initialData
        ? "Your product updates will be visible after saving."
        : "This product will be added to your store.",
      confirmLabel: initialData ? "Save changes" : "Create product",
      cancelLabel: "Keep editing",
    });

    if (!confirmed) {
      return;
    }

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

    setHasUnsavedChanges(false);
    
    await onSubmit({
      data: normalizedData,
      imageFile,
    });
  };

  /*
  |--------------------------------------------------------------------------
  | Form
  |--------------------------------------------------------------------------
  */

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6"
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Image */}
        <div className="lg:col-span-1">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Product Image
          </label>

          <div className="relative">
            {imagePreview ? (
              <div className="relative aspect-square overflow-hidden rounded-xl bg-white">
                <Image
                  src={imagePreview}
                  alt="Product preview"
                  fill
                  className="object-contain"
                />

                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute right-2 top-2 rounded-full bg-red-500 p-1.5 text-white transition hover:bg-red-600"
                  aria-label="Remove image"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 transition hover:border-orange-400">
                <Upload className="mb-2 h-10 w-10 text-gray-400" />

                <p className="px-4 text-center text-sm text-gray-500">
                  Click to upload product
                  image
                </p>

                <p className="mt-1 text-xs text-gray-400">
                  JPG, PNG, WebP, or HEIC, up to 10MB
                </p>

                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  capture="environment"
                  onChange={
                    handleImageUpload
                  }
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        {/* Fields */}
        <div className="space-y-4 lg:col-span-2">
          {/* Name and Category */}
          <div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Product Name *
              </label>

              <input
                type="text"
                value={formData.name}
                onChange={(event) =>
                  updateField(
                    "name",
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 focus:border-transparent focus:ring-2 focus:ring-orange-500"
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
                onChange={(event) =>
                  updateField(
                    "category",
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 focus:ring-2 focus:ring-orange-500"
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
                value={formData.brand}
                onChange={(event) =>
                  updateField(
                    "brand",
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 focus:ring-2 focus:ring-orange-500"
                placeholder="e.g., Maggi"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                SKU
              </label>

              <input
                type="text"
                value={formData.sku}
                onChange={(event) =>
                  updateField(
                    "sku",
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 uppercase focus:ring-2 focus:ring-orange-500"
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
              onChange={(event) =>
                updateField(
                  "description",
                  event.target.value
                )
              }
              rows={3}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 focus:border-transparent focus:ring-2 focus:ring-orange-500"
              placeholder="Describe the product..."
            />
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Regular Price ($) *
              </label>

              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={priceInput}
                  onChange={(event) =>
                    handlePriceChange(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g., 14.99"
                  required
                />
              </div>

              <p className="mt-1 text-xs text-gray-400">
                Regular product price. Add a discount promotion below to show a sale price to customers.
              </p>
            </div>
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
                  value={stockInput}
                  onChange={(event) =>
                    handleStockChange(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-orange-500"
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
                  onChange={(event) =>
                    handleSizeValueChange(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g., 2"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Size Unit
              </label>

              <select
                value={sizeUnit}
                onChange={(event) =>
                  handleSizeUnitChange(
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 focus:ring-2 focus:ring-orange-500"
              >
                {PRODUCT_SIZE_UNITS.map(
                  (unit) => (
                    <option
                      key={unit.value}
                      value={unit.value}
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
            <div className="flex items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={
                    formData.featured
                  }
                  onChange={(event) =>
                    updateField(
                      "featured",
                      event.target.checked
                    )
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
                  onChange={(event) =>
                    updateField(
                      "isAvailable",
                      event.target.checked
                    )
                  }
                  className="h-4 w-4 rounded text-green-500 focus:ring-green-500"
                />

                Available
              </label>
            </div>
          </div>

          {/* Promotion */}
          <ProductPromotionSection
            promotion={
              formData.promotion
            }
            onChange={(promotion) =>
              updateField(
                "promotion",
                promotion
              )
            }
          />
          {/* Submit */}
          {successMessage && (
            <div
              role="status"
              className="mb-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2"
            >
              <p className="text-sm font-medium text-green-700">
                {successMessage}
              </p>
            </div>
          )}
          <div className="flex gap-3 border-t border-gray-200 pt-4">
            <Link
              href="/store/products"
              className="flex-1 rounded-xl border border-gray-200 py-3 text-center font-medium text-gray-600 transition hover:bg-gray-50"
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={loading}
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

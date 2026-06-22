"use client";

/*
  Reusable product form for add/edit.
*/

import {useState, useEffect} from "react";
import {motion} from "framer-motion";
import Image from "next/image";
import {
  Upload,
  X,
  Plus,
  Minus,
  Tag,
  DollarSign,
  Package,
  Ruler,
  Percent,
  Gift,
  Star,
  Save,
  Link,
} from "lucide-react";
import {ProductFormData, CATEGORIES, SIZE_UNITS, PROMOTION_TYPES} from "../types";

interface ProductFormProps {
  initialData?: any;
  onSubmit: (data: ProductFormData) => void;
  loading: boolean;
  submitLabel: string;
}

export function ProductForm({
  initialData,
  onSubmit,
  loading,
  submitLabel,
}: ProductFormProps) {
  const [formData, setFormData] = useState<ProductFormData>({
    name: "",
    description: "",
    category: "",
    price: 0,
    displayPrice: 0,
    taxRate: 0,
    imageUrl: "",
    stock: 0,
    sizeValue: 0,
    sizeUnit: "each",
    promotionType: undefined,
    promotionDescription: "",
    promotionDiscount: 0,
    promotionCode: "",
    promotionExpires: "",
    isActive: true,
    isFeatured: false,
  });

  const [imagePreview, setImagePreview] = useState<string>("");
  const [showPromotion, setShowPromotion] = useState(false);

  // Load initial data
  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || "",
        description: initialData.description || "",
        category: initialData.category || "",
        price: initialData.price || 0,
        displayPrice: initialData.displayPrice || initialData.price || 0,
        taxRate: initialData.taxRate || 0,
        imageUrl: initialData.imageUrl || "",
        stock: initialData.stock || 0,
        sizeValue: initialData.size?.value || 0,
        sizeUnit: initialData.size?.unit || "each",
        promotionType: initialData.promotion?.type,
        promotionDescription: initialData.promotion?.description || "",
        promotionDiscount: initialData.promotion?.discountAmount || 0,
        promotionCode: initialData.promotion?.code || "",
        promotionExpires: initialData.promotion?.expiresAt || "",
        isActive: initialData.isActive !== false,
        isFeatured: initialData.isFeatured || false,
      });
      setImagePreview(initialData.imageUrl || "");

      if (initialData.promotion) {
        setShowPromotion(true);
      }
    }
  }, [initialData]);

  /*
    Handle image upload.
  */
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // In a real app, you would upload to Firebase Storage here
    // For now, we'll create a local preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
      setFormData({...formData, imageUrl: reader.result as string});
    };
    reader.readAsDataURL(file);
  };

  /*
    Remove image.
  */
  const removeImage = () => {
    setImagePreview("");
    setFormData({...formData, imageUrl: ""});
  };

  /*
    Handle form submission.
  */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.name.trim()) {
      alert("Product name is required");
      return;
    }
    if (!formData.category) {
      alert("Please select a category");
      return;
    }
    if (formData.price <= 0) {
      alert("Price must be greater than 0");
      return;
    }

    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Image */}
        <div className="lg:col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Product Image
          </label>
          <div className="relative">
            {imagePreview ? (
              <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                <Image
                  src={imagePreview}
                  alt="Product preview"
                  fill
                  className="object-cover"
                />
                <button
                  type="button"
                  onClick={removeImage}
                  className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition"
                  aria-label="Remove image"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center aspect-square rounded-xl border-2 border-dashed border-gray-300 hover:border-orange-400 transition cursor-pointer bg-gray-50">
                <Upload className="w-10 h-10 text-gray-400 mb-2" />
                <p className="text-sm text-gray-500 text-center px-4">
                  Click to upload product image
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  PNG, JPG up to 5MB
                </p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            )}
          </div>
        </div>

        {/* Right Column - Form Fields */}
        <div className="lg:col-span-2 space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({...formData, name: e.target.value})
                }
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                placeholder="e.g., Jollof Rice Mix"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category *
              </label>
              <select
                value={formData.category}
                onChange={(e) =>
                  setFormData({...formData, category: e.target.value})
                }
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                required
              >
                <option value="">Select category</option>
                {CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) =>
                setFormData({...formData, description: e.target.value})
              }
              rows={3}
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="Describe your product..."
            />
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price ($) *
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price}
                  onChange={(e) =>
                    setFormData({...formData, price: parseFloat(e.target.value) || 0})
                  }
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                  placeholder="0.00"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Display Price
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.displayPrice}
                  onChange={(e) =>
                    setFormData({...formData, displayPrice: parseFloat(e.target.value) || 0})
                  }
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                  placeholder="0.00"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Original price before discount
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tax Rate (%)
              </label>
              <div className="relative">
                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.taxRate}
                  onChange={(e) =>
                    setFormData({...formData, taxRate: parseFloat(e.target.value) || 0})
                  }
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                  placeholder="8.0"
                />
              </div>
            </div>
          </div>

          {/* Stock & Size */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Stock Quantity *
              </label>
              <div className="relative">
                <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.stock}
                  onChange={(e) =>
                    setFormData({...formData, stock: parseInt(e.target.value) || 0})
                  }
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                  placeholder="0"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Size Value
              </label>
              <div className="relative">
                <Ruler className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.sizeValue}
                  onChange={(e) =>
                    setFormData({...formData, sizeValue: parseFloat(e.target.value) || 0})
                  }
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                  placeholder="0"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Size Unit
              </label>
              <select
                value={formData.sizeUnit}
                onChange={(e) =>
                  setFormData({...formData, sizeUnit: e.target.value as any})
                }
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
              >
                {SIZE_UNITS.map((unit) => (
                  <option key={unit.value} value={unit.value}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Promotion Toggle */}
          <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
            <button
              type="button"
              onClick={() => setShowPromotion(!showPromotion)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
                showPromotion
                  ? "bg-orange-100 text-orange-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <Gift className="w-4 h-4" />
              {showPromotion ? "Hide Promotion" : "Add Promotion"}
            </button>
            <div className="flex items-center gap-4 ml-auto">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isFeatured}
                  onChange={(e) =>
                    setFormData({...formData, isFeatured: e.target.checked})
                  }
                  className="w-4 h-4 text-orange-500 focus:ring-orange-500 rounded"
                />
                <Star className="w-4 h-4 text-yellow-500" />
                Featured
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) =>
                    setFormData({...formData, isActive: e.target.checked})
                  }
                  className="w-4 h-4 text-green-500 focus:ring-green-500 rounded"
                />
                Active
              </label>
            </div>
          </div>

          {/* Promotion Details */}
          {showPromotion && (
            <motion.div
              initial={{opacity: 0, height: 0}}
              animate={{opacity: 1, height: "auto"}}
              exit={{opacity: 0, height: 0}}
              className="bg-orange-50 rounded-xl p-4 border border-orange-200 space-y-3"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Promotion Type
                  </label>
                  <select
                    value={formData.promotionType || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        promotionType: e.target.value as any || undefined,
                      })
                    }
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Select type</option>
                    {PROMOTION_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={formData.promotionDescription}
                    onChange={(e) =>
                      setFormData({...formData, promotionDescription: e.target.value})
                    }
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                    placeholder="e.g., Buy 1 Get 1 Free"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {formData.promotionType === "discount" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Discount Amount (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.promotionDiscount}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          promotionDiscount: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                      placeholder="20"
                    />
                  </div>
                )}
                {formData.promotionType === "code" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Promo Code
                    </label>
                    <input
                      type="text"
                      value={formData.promotionCode}
                      onChange={(e) =>
                        setFormData({...formData, promotionCode: e.target.value.toUpperCase()})
                      }
                      className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 uppercase"
                      placeholder="SUMMER20"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expires At
                  </label>
                  <input
                    type="date"
                    value={formData.promotionExpires}
                    onChange={(e) =>
                      setFormData({...formData, promotionExpires: e.target.value})
                    }
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* Submit */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <Link
              href="/store/products"
              className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition text-center"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-semibold hover:shadow-lg hover:from-orange-600 hover:to-orange-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Save className="w-4 h-4" />
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
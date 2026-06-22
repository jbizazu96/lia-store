/*
  Product types for the store dashboard.
*/

export interface Product {
  id: string;
  storeId: string;
  name: string;
  description: string;
  category: string;
  price: number;
  displayPrice: number;        // Original price before discount
  taxRate: number;            // Tax percentage (e.g., 0.08 for 8%)
  imageUrl: string;
  stock: number;
  size: {
    value: number;
    unit: "lb" | "oz" | "kg" | "g" | "ml" | "L" | "each" | "bunch" | "box";
  };
  promotion?: {
    type: "bogo" | "discount" | "code" | "free_shipping";
    description: string;
    discountAmount?: number;   // For discount type
    code?: string;             // For code type
    expiresAt?: string;
  };
  isActive: boolean;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductFormData {
  name: string;
  description: string;
  category: string;
  price: number;
  displayPrice: number;
  taxRate: number;
  imageUrl: string;
  stock: number;
  sizeValue: number;
  sizeUnit: "lb" | "oz" | "kg" | "g" | "ml" | "L" | "each" | "bunch" | "box";
  promotionType?: "bogo" | "discount" | "code" | "free_shipping";
  promotionDescription?: string;
  promotionDiscount?: number;
  promotionCode?: string;
  promotionExpires?: string;
  isActive: boolean;
  isFeatured: boolean;
}

export const SIZE_UNITS = [
  { value: "lb", label: "Pounds (lb)" },
  { value: "oz", label: "Ounces (oz)" },
  { value: "kg", label: "Kilograms (kg)" },
  { value: "g", label: "Grams (g)" },
  { value: "ml", label: "Milliliters (ml)" },
  { value: "L", label: "Liters (L)" },
  { value: "each", label: "Each" },
  { value: "bunch", label: "Bunch" },
  { value: "box", label: "Box" },
];

export const CATEGORIES = [
  { value: "produce", label: "Fresh Produce" },
  { value: "meat", label: "Meat & Poultry" },
  { value: "seafood", label: "Seafood" },
  { value: "dairy", label: "Dairy & Eggs" },
  { value: "pantry", label: "Pantry Staples" },
  { value: "spices", label: "Spices & Seasonings" },
  { value: "snacks", label: "Snacks & Treats" },
  { value: "beverages", label: "Beverages" },
  { value: "frozen", label: "Frozen Foods" },
  { value: "international", label: "International Foods" },
  { value: "health", label: "Health & Wellness" },
  { value: "household", label: "Household Items" },
];

export const PROMOTION_TYPES = [
  { value: "bogo", label: "Buy One Get One Free" },
  { value: "discount", label: "Discount" },
  { value: "code", label: "Promo Code" },
  { value: "free_shipping", label: "Free Shipping" },
];
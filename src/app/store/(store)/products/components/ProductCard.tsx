"use client";

/*
  Compact product card with proper image fit.
  Shows stock with color indicators and quick action buttons.
*/

import {useState} from "react";
import {motion, AnimatePresence} from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import {
  Edit2,
  Trash2,
  Star,
  StarOff,
  Package,
  DollarSign,
  MoreVertical,
  Copy,
  ShoppingBag,
} from "lucide-react";
import {Product} from "../types";

interface ProductCardProps {
  product: Product;
  onToggleActive: (id: string, current: boolean) => void;
  onToggleFeatured: (id: string, current: boolean) => void;
  onDelete: (id: string) => void;
  onDuplicate?: (product: Product) => void;
}

export function ProductCard({
  product,
  onToggleActive,
  onToggleFeatured,
  onDelete,
  onDuplicate,
}: ProductCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  // Format price
  const formatPrice = (price: number) => {
    return `$${price.toFixed(2)}`;
  };

  // Check if product is on sale
  const isOnSale = product.displayPrice > product.price;

  // Get stock color based on quantity
  const getStockColor = (stock: number) => {
    if (stock > 40) return "bg-green-500 text-white";
    if (stock > 20) return "bg-yellow-500 text-white";
    if (stock > 0) return "bg-orange-500 text-white";
    return "bg-red-500 text-white";
  };

  // Get stock label
  const getStockLabel = (stock: number) => {
    if (stock > 40) return "In Stock";
    if (stock > 20) return "Low Stock";
    if (stock > 0) return "Very Low";
    return "Out of Stock";
  };

  // Toggle menu
  const toggleMenu = () => setShowMenu(!showMenu);

  return (
    <motion.div
      initial={{opacity: 0, scale: 0.95}}
      animate={{opacity: 1, scale: 1}}
      whileHover={{y: -2}}
      className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition border border-gray-100"
    >
      {/* Image - Fixed ratio with object-cover */}
      <div className="relative w-full aspect-square bg-white-100 overflow-hidden">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            className="object-contain p-2"
            sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 20vw"
            priority={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-10 h-10 text-gray-300" />
          </div>
        )}

        {/* Featured Badge - Top Left */}
        {product.isFeatured && (
          <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-yellow-400 text-white text-[10px] font-bold rounded-full flex items-center gap-0.5">
            <Star className="w-2.5 h-2.5 fill-white" />
          </div>
        )}

        {/* Stock Badge - Bottom Left with color */}
        <div className={`absolute bottom-1.5 left-1.5 px-1.5 py-0.5 text-[10px] font-medium rounded-full flex items-center gap-1 ${getStockColor(product.stock)}`}>
          <Package className="w-2.5 h-2.5" />
          <span>{product.stock}</span>
          <span className="opacity-80">•</span>
          <span>{getStockLabel(product.stock)}</span>
        </div>

        {/* Three-dot Menu */}
        <div className="absolute top-1.5 right-1.5">
          <button
            onClick={toggleMenu}
            className="p-1 bg-white/90 backdrop-blur-sm rounded-full hover:bg-white transition shadow-sm"
            aria-label="Product actions"
          >
            <MoreVertical className="w-3.5 h-3.5 text-gray-600" />
          </button>

          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{opacity: 0, scale: 0.95, y: -5}}
                animate={{opacity: 1, scale: 1, y: 0}}
                exit={{opacity: 0, scale: 0.95, y: -5}}
                className="absolute right-0 top-6 w-40 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-20"
              >
                <Link
                  href={`/store/products/${product.id}`}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition"
                  onClick={() => setShowMenu(false)}
                >
                  <Edit2 className="w-3 h-3" />
                  Edit
                </Link>
                <button
                  onClick={() => {
                    onDuplicate?.(product);
                    setShowMenu(false);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition w-full"
                >
                  <Copy className="w-3 h-3" />
                  Duplicate
                </button>
                <div className="border-t border-gray-100 my-0.5" />
                <button
                  onClick={() => {
                    onDelete(product.id);
                    setShowMenu(false);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 transition w-full"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Info - Compact */}
      <div className="p-2.5">
        {/* Name & Category */}
        <div className="mb-1">
          <h3 className="font-semibold text-gray-800 text-xs truncate">
            {product.name}
          </h3>
          <p className="text-[10px] text-gray-500 truncate">{product.category}</p>
        </div>

        {/* Price & Size */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className="flex items-center gap-0.5">
            <DollarSign className="w-2.5 h-2.5 text-gray-400" />
            {isOnSale ? (
              <>
                <span className="text-xs font-bold text-green-600">
                  {formatPrice(product.price)}
                </span>
                <span className="text-[9px] text-gray-400 line-through">
                  {formatPrice(product.displayPrice)}
                </span>
              </>
            ) : (
              <span className="text-xs font-bold text-gray-800">
                {formatPrice(product.price)}
              </span>
            )}
          </div>
          {product.size?.value > 0 && (
            <span className="text-[9px] text-gray-500">
              {product.size.value}{product.size.unit}
            </span>
          )}
        </div>

        {/* Quick Actions - Two buttons side by side */}
        <div className="flex items-center gap-1 pt-1 border-t border-gray-100">
          {/* Active/Inactive Button */}
          <button
            onClick={() => onToggleActive(product.id, product.isActive)}
            className={`flex-1 text-[10px] font-medium px-1.5 py-1 rounded-full transition ${
              product.isActive
                ? "bg-green-100 text-green-700 hover:bg-green-200"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            aria-label={product.isActive ? "Deactivate product" : "Activate product"}
          >
            {product.isActive ? "Active" : "Inactive"}
          </button>
          
          {/* Feature Button */}
          <button
            onClick={() => onToggleFeatured(product.id, product.isFeatured)}
            className={`flex-1 text-[10px] font-medium px-1.5 py-1 rounded-full transition flex items-center justify-center gap-0.5 ${
              product.isFeatured
                ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            aria-label={product.isFeatured ? "Remove from featured" : "Add to featured"}
          >
            <Star className={`w-2.5 h-2.5 ${product.isFeatured ? "fill-yellow-500" : ""}`} />
            {product.isFeatured ? "Featured" : "Feature"}
          </button>

          {/* Promotion indicator */}
          {product.promotion && (
            <span className="text-[9px] text-orange-600 font-medium bg-orange-50 px-1 py-0.5 rounded truncate max-w-[35px]">
              {product.promotion.type === "bogo" && "BOGO"}
              {product.promotion.type === "discount" && `${product.promotion.discountAmount}%`}
              {product.promotion.type === "code" && "Code"}
              {product.promotion.type === "free_shipping" && "FreeShip"}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
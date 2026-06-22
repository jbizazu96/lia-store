"use client";

/*
  Product card - Mobile optimized with image on top.
  Price with superscript dollars and cents.
  Smaller size for mobile devices.
*/

import {useState} from "react";
import {motion} from "framer-motion";
import Image from "next/image";
import {Star, Plus, Package, TrendingUp, Clock} from "lucide-react";
import {Product} from "../types";

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
}

export function ProductCard({ product, onAddToCart }: ProductCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Format price with superscript cents
  const formatPrice = (price: number) => {
    const dollars = Math.floor(price);
    const cents = Math.round((price - dollars) * 100);
    return { dollars, cents: cents.toString().padStart(2, '0') };
  };

  const price = formatPrice(product.price);
  const displayPrice = formatPrice(product.displayPrice);

  // Get stock status
  const getStockStatus = (stock: number) => {
    if (stock > 20) return {label: "In stock", color: "text-green-600"};
    if (stock > 5) return {label: "Few left", color: "text-yellow-600"};
    if (stock > 0) return {label: "Last chance", color: "text-orange-600"};
    return {label: "Out of stock", color: "text-red-600"};
  };

  const stockStatus = getStockStatus(product.stock);
  const isOnSale = product.displayPrice > product.price;

  // Format sold count
  const formatSoldCount = (count: number) => {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k+`;
    if (count > 0) return `${count}+`;
    return "";
  };

  // Generate stars
  const renderStars = (rating: number) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const totalStars = 5;
    
    return (
      <div className="flex items-center gap-0.5">
        {[...Array(fullStars)].map((_, i) => (
          <Star key={i} className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
        ))}
        {hasHalfStar && (
          <Star className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
        )}
        {[...Array(totalStars - fullStars - (hasHalfStar ? 1 : 0))].map((_, i) => (
          <Star key={i + fullStars + 1} className="w-2.5 h-2.5 text-gray-300" />
        ))}
        <span className="text-[10px] font-medium text-gray-600 ml-0.5">
          {rating.toFixed(1)}
        </span>
      </div>
    );
  };

  return (
    <motion.div
      whileHover={{y: -2}}
      className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition border border-gray-100 w-[140px] flex-shrink-0"
    >
      {/* Product Image - Top */}
      <div className="relative w-full h-[100px] bg-white-100">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            className="object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-8 h-8 text-gray-300" />
          </div>
        )}
        
        {/* Sale Badge */}
        {isOnSale && (
          <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-red-500 text-white text-[8px] font-medium rounded-full">
            Sale
          </div>
        )}
      </div>

      {/* Product Info - Bottom */}
      <div className="p-2">
        {/* Product Name */}
        <h4 className="font-semibold text-gray-800 text-xs truncate">
          {product.name}
        </h4>

        {/* Size/Weight */}
        {product.size && product.size.value > 0 && (
          <p className="text-[10px] text-gray-400">
            {product.size.value}{product.size.unit}
          </p>
        )}

        {/* Price - Beautiful with superscript cents */}
        <div className="flex items-center gap-1 mt-0.5">
          {isOnSale ? (
            <>
              <span className="text-sm font-bold text-orange-600">
                ${price.dollars}
                <sup className="text-[8px] font-semibold text-orange-600">
                  .{price.cents}
                </sup>
              </span>
              <span className="text-[9px] text-gray-400 line-through">
                ${displayPrice.dollars}
                <sup>.{displayPrice.cents}</sup>
              </span>
            </>
          ) : (
            <span className="text-sm font-bold text-gray-800">
              ${price.dollars}
              <sup className="text-[8px] font-semibold text-gray-600">
                .{price.cents}
              </sup>
            </span>
          )}
        </div>

        {/* Stock Status */}
        <p className={`text-[9px] font-medium ${stockStatus.color}`}>
          {stockStatus.label}
        </p>

        {/* Rating & Sold - Compact */}
        <div className="flex items-center gap-1 mt-0.5">
          {product.rating > 0 && (
            <div className="flex items-center gap-0.5">
              {renderStars(product.rating)}
            </div>
          )}
          
          {product.soldCount > 0 && (
            <div className="flex items-center gap-0.5 text-[9px] text-gray-500">
              <TrendingUp className="w-2.5 h-2.5" />
              <span>{formatSoldCount(product.soldCount)}</span>
            </div>
          )}
        </div>

        {/* Add Button - Bottom */}
        <button
          type="button"
          onClick={() => onAddToCart(product)}
          className="w-full mt-1.5 py-1.5 bg-orange-500 text-white text-[10px] font-semibold rounded-lg hover:bg-orange-600 transition flex items-center justify-center gap-1"
          aria-label={`Add ${product.name} to cart`}
        >
          <Plus className="w-3 h-3" />
          Add
        </button>
      </div>
    </motion.div>
  );
}
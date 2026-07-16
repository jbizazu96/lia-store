"use client";

/*
  Product card with quantity controls.
  Shows "+" button initially, then "-" and "+" with count when added.
*/

import {useState} from "react";
import {motion} from "framer-motion";
import Image from "next/image";
import {Star, Plus, Minus, Package, TrendingUp, Clock} from "lucide-react";
import {Product} from "../types";

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
  onQuantityChange: (productId: string, quantity: number) => void;
  quantity: number;
}

export function ProductCard({
  product,
  onAddToCart,
  onQuantityChange,
  quantity,
}: ProductCardProps) {
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

  // ✅ Handle quantity change
  const handleDecrease = () => {
    if (quantity > 0) {
      onQuantityChange(product.id, quantity - 1);
    }
  };

  const handleIncrease = () => {
    onQuantityChange(product.id, quantity + 1);
  };

  const handleAdd = () => {
    onAddToCart(product);
  };

  const isInCart = quantity > 0;

  return (
    <motion.div
      whileHover={{y: -2}}
      className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition border border-gray-100 w-[140px] flex-shrink-0"
    >
      {/* Product Image */}
      <div className="relative w-full h-[100px] bg-white">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            className="object-contain p-1"
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

      {/* Product Info */}
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

        {/* Price */}
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

        {/* Rating & Sold */}
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

        {/* ✅ Add/Quantity Button */}
        {isInCart ? (
          <div className="flex items-center justify-between mt-1.5 bg-orange-50 rounded-lg p-0.5 border border-orange-200">
            <button
              onClick={handleDecrease}
              className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-orange-100 transition text-orange-600"
              aria-label="Decrease quantity"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="text-xs font-semibold text-orange-600 min-w-[20px] text-center">
              {quantity}
            </span>
            <button
              onClick={handleIncrease}
              className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-orange-100 transition text-orange-600"
              aria-label="Increase quantity"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={handleAdd}
            className="w-full mt-1.5 py-1.5 bg-orange-500 text-white text-[10px] font-semibold rounded-lg hover:bg-orange-600 transition flex items-center justify-center gap-1"
            aria-label={`Add ${product.name} to cart`}
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        )}
      </div>
    </motion.div>
  );
}
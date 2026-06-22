"use client";

/*
  Loading skeleton for product cards.
  Shows placeholder while products are loading.
*/

export function ProductSkeleton() {
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 animate-pulse">
      {/* Image skeleton */}
      <div className="aspect-square bg-gray-200" />
      
      {/* Content skeleton */}
      <div className="p-3 space-y-2">
        {/* Price */}
        <div className="flex items-center gap-2">
          <div className="h-4 bg-gray-200 rounded w-12" />
          <div className="h-3 bg-gray-200 rounded w-8" />
        </div>
        
        {/* Name */}
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        
        {/* Description */}
        <div className="h-3 bg-gray-200 rounded w-1/2" />
        
        {/* Rating & Sold */}
        <div className="flex items-center gap-2 mt-1.5">
          <div className="h-3 bg-gray-200 rounded w-10" />
          <div className="w-0.5 h-3 bg-gray-200" />
          <div className="h-3 bg-gray-200 rounded w-12" />
        </div>
        
        {/* Size */}
        <div className="h-2 bg-gray-200 rounded w-8" />
      </div>
    </div>
  );
}
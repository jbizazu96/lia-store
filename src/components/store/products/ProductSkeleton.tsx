"use client";

/*
  Loading skeleton for product cards.
*/

export function ProductSkeleton() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 animate-pulse">
      <div className="flex">
        {/* Image skeleton */}
        <div className="w-32 h-32 bg-gray-200 flex-shrink-0" />
        
        {/* Content skeleton */}
        <div className="flex-1 p-3 space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-2 flex-1">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
            <div className="w-6 h-6 bg-gray-200 rounded" />
          </div>
          
          <div className="flex items-center gap-3">
            <div className="h-4 bg-gray-200 rounded w-16" />
            <div className="h-3 bg-gray-200 rounded w-12" />
          </div>
          
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <div className="h-5 bg-gray-200 rounded-full w-16" />
            <div className="h-5 bg-gray-200 rounded-full w-12" />
          </div>
        </div>
      </div>
    </div>
  );
}
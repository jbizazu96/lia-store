"use client";

export function StoreCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm animate-pulse">
      {/* Image Skeleton */}
      <div className="h-48 bg-gray-200" />
      
      {/* Content Skeleton */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gray-200" />
            <div className="w-32 h-4 bg-gray-200 rounded" />
          </div>
          <div className="w-16 h-4 bg-gray-200 rounded" />
        </div>
        
        <div className="flex items-center gap-4">
          <div className="w-20 h-3 bg-gray-200 rounded" />
          <div className="w-24 h-3 bg-gray-200 rounded" />
        </div>
        
        <div className="w-32 h-3 bg-gray-200 rounded" />
      </div>
    </div>
  );
}
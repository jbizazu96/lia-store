"use client";

/*
  Loading skeleton for order detail page.
*/

export function OrderDetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 bg-gray-200 rounded-full" />
        <div>
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="flex items-center gap-3 mt-1">
            <div className="h-6 w-20 bg-gray-200 rounded-full" />
            <div className="h-4 w-32 bg-gray-200 rounded" />
          </div>
        </div>
      </div>

      {/* Timeline Skeleton */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100">
        <div className="flex items-center justify-between">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex-1 flex items-center">
              <div className="flex flex-col items-center flex-1">
                <div className="w-10 h-10 bg-gray-200 rounded-full" />
                <div className="h-3 w-12 bg-gray-200 rounded mt-1" />
              </div>
              {i < 5 && <div className="flex-1 h-0.5 bg-gray-200" />}
            </div>
          ))}
        </div>
      </div>

      {/* Content Skeleton */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <div className="h-6 w-32 bg-gray-200 rounded mb-4" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-200 rounded-full" />
                    <div>
                      <div className="h-4 w-32 bg-gray-200 rounded" />
                      <div className="h-3 w-20 bg-gray-200 rounded mt-1" />
                    </div>
                  </div>
                  <div className="h-4 w-16 bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <div className="h-6 w-24 bg-gray-200 rounded mb-4" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-4 h-4 bg-gray-200 rounded" />
                  <div className="h-4 w-32 bg-gray-200 rounded" />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <div className="h-6 w-32 bg-gray-200 rounded mb-4" />
            <div className="h-12 w-full bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
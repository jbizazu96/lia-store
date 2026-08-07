interface PageContentSkeletonProps {
  cards?: number;
  rows?: number;
}

/*
 * Lightweight content placeholder for data-heavy workspace pages. It keeps
 * the page layout stable while protected callable data is being retrieved.
 */
export function PageContentSkeleton({
  cards = 4,
  rows = 3,
}: PageContentSkeletonProps) {
  return (
    <div className="animate-pulse space-y-6" aria-label="Loading content">
      <div className="space-y-2">
        <div className="h-7 w-44 rounded bg-slate-200" />
        <div className="h-4 w-72 max-w-full rounded bg-slate-100" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: cards }, (_, index) => (
          <div key={index} className="h-28 rounded-2xl bg-white shadow-sm ring-1 ring-slate-100" />
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex items-center justify-between border-b border-slate-100 p-5 last:border-0">
            <div className="space-y-2"><div className="h-4 w-40 rounded bg-slate-200" /><div className="h-3 w-24 rounded bg-slate-100" /></div>
            <div className="h-7 w-20 rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

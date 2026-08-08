type CustomerSkeletonVariant =
  | "home"
  | "store"
  | "cart"
  | "orders"
  | "profile"
  | "product"
  | "order-detail"
  | "store-info"
  | "search";

function Block({ className }: { className: string }) {
  return <div className={`rounded-xl bg-gray-200/80 ${className}`} />;
}

function HeaderSkeleton({ withCount = false }: { withCount?: boolean }) {
  return (
    <header className="sticky top-0 z-20 bg-white/95 px-4 py-4 backdrop-blur-xl">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
        <Block className="h-7 w-36" />
        {withCount && <Block className="h-5 w-14" />}
      </div>
    </header>
  );
}

function ProductGrid() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="space-y-3">
          <Block className="aspect-square w-full rounded-2xl" />
          <Block className="h-4 w-2/5" />
          <Block className="h-4 w-4/5" />
          <Block className="h-3 w-3/5" />
        </div>
      ))}
    </div>
  );
}

function StoreCards() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-2xl border border-gray-100 bg-white/70 shadow-sm">
          <Block className="h-32 w-full rounded-none" />
          <div className="space-y-3 p-4">
            <Block className="h-5 w-1/2" />
            <Block className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface CustomerPageSkeletonProps {
  variant: CustomerSkeletonVariant;
}

/* Layout-shaped placeholders prevent a blank or unrelated loading screen. */
export function CustomerPageSkeleton({ variant }: CustomerPageSkeletonProps) {
  if (variant === "home") {
    return (
      <main className="min-h-screen animate-pulse bg-white pb-28">
        <HeaderSkeleton />
        <div className="mx-auto max-w-2xl space-y-5 px-4 pt-5">
          <div className="space-y-2"><Block className="h-4 w-16" /><Block className="h-8 w-40" /></div>
          <Block className="h-11 w-full rounded-full" />
          <Block className="h-32 w-full rounded-2xl" />
          <Block className="h-6 w-36" />
          <StoreCards />
        </div>
      </main>
    );
  }

  if (variant === "store") {
    return (
      <main className="min-h-screen animate-pulse bg-white pb-28">
        <Block className="h-48 w-full rounded-none" />
        <div className="mx-auto max-w-2xl space-y-5 px-4 pt-12">
          <div className="mx-auto -mt-20 h-20 w-20 rounded-full border-4 border-gray-50 bg-gray-200" />
          <div className="space-y-2 text-center"><Block className="mx-auto h-7 w-48" /><Block className="mx-auto h-4 w-36" /></div>
          <Block className="h-11 w-full rounded-full" />
          <div className="flex gap-2 overflow-hidden"><Block className="h-9 w-20" /><Block className="h-9 w-24" /><Block className="h-9 w-20" /></div>
          <ProductGrid />
        </div>
      </main>
    );
  }

  if (variant === "cart") {
    return (
      <main className="min-h-screen animate-pulse bg-white pb-48">
        <HeaderSkeleton />
        <div className="mx-auto max-w-2xl space-y-3 px-4 py-5">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex gap-4 rounded-2xl border border-gray-100 bg-white/70 p-4">
              <Block className="h-20 w-20 shrink-0" />
              <div className="flex-1 space-y-3"><Block className="h-5 w-3/4" /><Block className="h-4 w-2/5" /><Block className="h-8 w-24" /></div>
            </div>
          ))}
        </div>
        <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 p-4 backdrop-blur-xl"><div className="mx-auto max-w-2xl space-y-3"><Block className="h-4 w-full" /><Block className="h-12 w-full" /></div></div>
      </main>
    );
  }

  if (variant === "orders") {
    return (
      <main className="min-h-screen animate-pulse bg-white pb-28">
        <HeaderSkeleton withCount />
        <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="space-y-4 rounded-2xl border border-gray-100 bg-white/70 p-5"><Block className="h-5 w-1/2" /><Block className="h-4 w-3/4" /><div className="flex justify-between"><Block className="h-5 w-20" /><Block className="h-8 w-24" /></div></div>)}
        </div>
      </main>
    );
  }

  if (variant === "profile") {
    return (
      <main className="min-h-screen animate-pulse bg-white pb-28">
        <HeaderSkeleton />
        <div className="mx-auto max-w-lg px-4 py-7"><div className="flex flex-col items-center gap-3 border-b border-gray-200/70 pb-7"><div className="h-24 w-24 rounded-full bg-gray-200" /><Block className="h-6 w-40" /><Block className="h-4 w-52" /></div><div className="mt-5 space-y-2">{Array.from({ length: 6 }, (_, index) => <div key={index} className="flex items-center gap-3 rounded-2xl bg-white/60 p-4"><div className="h-10 w-10 rounded-full bg-gray-200" /><div className="flex-1 space-y-2"><Block className="h-4 w-1/3" /><Block className="h-3 w-2/3" /></div></div>)}</div></div>
      </main>
    );
  }

  if (variant === "product") {
    return <main className="min-h-screen animate-pulse bg-white pb-28"><Block className="aspect-square w-full rounded-none" /><div className="mx-auto max-w-2xl space-y-4 px-4 py-5"><Block className="h-7 w-3/4" /><Block className="h-6 w-1/4" /><Block className="h-20 w-full" /><ProductGrid /></div></main>;
  }

  if (variant === "order-detail") {
    return <main className="min-h-screen animate-pulse bg-white pb-8"><HeaderSkeleton /><div className="mx-auto max-w-lg space-y-4 px-4 py-4">{Array.from({ length: 5 }, (_, index) => <div key={index} className="space-y-3 rounded-2xl border border-gray-100 bg-white/70 p-5"><Block className="h-5 w-2/5" /><Block className="h-4 w-full" /><Block className="h-4 w-4/5" /></div>)}</div></main>;
  }

  if (variant === "store-info") {
    return <main className="min-h-screen animate-pulse bg-white pb-8"><HeaderSkeleton /><Block className="h-64 w-full rounded-none" /><div className="space-y-4 p-4">{Array.from({ length: 3 }, (_, index) => <div key={index} className="space-y-3 rounded-2xl bg-white/70 p-5"><Block className="h-5 w-1/3" /><Block className="h-4 w-full" /><Block className="h-4 w-3/4" /></div>)}</div></main>;
  }

  return <div className="animate-pulse space-y-4 py-4"><Block className="h-11 w-full rounded-full" /><ProductGrid /></div>;
}

import { BrandedLoader } from "@/components/ui/BrandedLoader";

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

const messages: Record<Exclude<CustomerSkeletonVariant, "search">, string> = {
  home: "Loading stores",
  store: "Loading store",
  cart: "Loading cart",
  orders: "Loading orders",
  profile: "Loading profile",
  product: "Loading product",
  "order-detail": "Loading order",
  "store-info": "Loading store details",
};

function Block({ className }: { className: string }) {
  return <div className={`rounded-xl bg-gray-200/80 ${className}`} />;
}

function SearchResultsSkeleton() {
  return (
    <div className="animate-pulse space-y-4 py-4">
      <Block className="h-11 w-full rounded-full" />
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
    </div>
  );
}

export function CustomerPageSkeleton({
  variant,
}: {
  variant: CustomerSkeletonVariant;
}) {
  if (variant === "search") {
    return <SearchResultsSkeleton />;
  }

  return <BrandedLoader message={messages[variant]} />;
}

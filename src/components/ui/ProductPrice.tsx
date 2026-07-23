import {
  formatProductPrice,
} from "@/utils/productDisplay";

interface ProductPriceProps {
  price: number;
  className?: string;
}

/**
 * Shared customer-facing price treatment used by the store, cart, and checkout.
 */
export function ProductPrice({
  price,
  className = "",
}: ProductPriceProps) {
  const formattedPrice =
    formatProductPrice(price);

  return (
    <span
      className={`inline-flex items-baseline whitespace-nowrap text-base font-black leading-none tracking-tight ${className}`}
    >
      <span className="relative -top-1 mr-px text-[11px] font-bold leading-none">
        $
      </span>
      <span>{formattedPrice.dollars}</span>
      <span className="relative -top-1 text-[11px] font-bold leading-none">
        .{formattedPrice.cents}
      </span>
    </span>
  );
}

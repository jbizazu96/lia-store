/*
|--------------------------------------------------------------------------
| Customer Product and Store Display
|--------------------------------------------------------------------------
|
| Shared product text and price formatting for the store, cart, and checkout.
|
*/

export interface FormattedProductPrice {
  dollars: number;
  cents: string;
}

export function formatProductName(
  name: string
): string {
  return name
    .trim()
    .toLowerCase()
    .replace(
      /\b\p{L}/gu,
      (letter) => letter.toUpperCase()
    );
}

/* Store names use sentence case: one leading uppercase character only. */
export function formatStoreName(
  name: string
): string {
  const normalized = name.trim().toLocaleLowerCase();

  return normalized
    ? normalized.charAt(0).toLocaleUpperCase() + normalized.slice(1)
    : "";
}

export function formatProductPrice(
  price: number
): FormattedProductPrice {
  const centsTotal = Math.max(
    0,
    Math.round(
      (Number.isFinite(price) ? price : 0) *
      100
    )
  );

  return {
    dollars: Math.floor(centsTotal / 100),
    cents: (centsTotal % 100)
      .toString()
      .padStart(2, "0"),
  };
}

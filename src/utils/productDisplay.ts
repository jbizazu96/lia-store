/*
|--------------------------------------------------------------------------
| Customer Product Display
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

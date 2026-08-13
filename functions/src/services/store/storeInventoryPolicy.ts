export function normalizeStoreSku(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 120).toLocaleUpperCase("en-US") : "";
}

export function retailInventoryValue(price: unknown, stock: unknown): number {
  const normalizedPrice = typeof price === "number" && Number.isFinite(price) ? Math.max(0, price) : 0;
  const normalizedStock = typeof stock === "number" && Number.isFinite(stock) ? Math.max(0, Math.floor(stock)) : 0;
  return normalizedPrice * normalizedStock;
}

export function isConfiguredLowStock(stock: unknown, threshold: unknown): boolean {
  const normalizedStock = typeof stock === "number" && Number.isFinite(stock) ? Math.max(0, Math.floor(stock)) : 0;
  const normalizedThreshold = typeof threshold === "number" && Number.isFinite(threshold) ? Math.max(0, Math.floor(threshold)) : 10;
  return normalizedStock > 0 && normalizedStock <= normalizedThreshold;
}

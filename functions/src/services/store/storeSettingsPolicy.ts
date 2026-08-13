export interface StoreAddressFields {
  address?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
}

function normalized(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function hasStoreAddressChanged(
  existing: StoreAddressFields,
  requested: StoreAddressFields,
): boolean {
  return normalized(existing.address) !== normalized(requested.address) ||
    normalized(existing.city) !== normalized(requested.city) ||
    normalized(existing.state) !== normalized(requested.state) ||
    normalized(existing.zip) !== normalized(requested.zip);
}

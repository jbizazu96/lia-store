export type ZoneAccessType =
  | "same_home_zone"
  | "store_service_zone"
  | "customer_order_zone"
  | "default_pricing";

export interface ZonePricingDecision {
  customerHomeZoneId: string | null;
  storeHomeZoneId: string | null;
  pricingZoneId: string | null;
  zoneAccessType: ZoneAccessType;
  allowed: boolean;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

export function resolveZonePricingDecision(
  customer: Record<string, unknown>,
  store: Record<string, unknown>,
): ZonePricingDecision {
  const customerHomeZoneId = stringValue(customer.homeZoneId);
  const storeHomeZoneId = stringValue(store.homeZoneId);
  if (!customerHomeZoneId || !storeHomeZoneId) {
    return {customerHomeZoneId, storeHomeZoneId, pricingZoneId: null, zoneAccessType: "default_pricing", allowed: true};
  }
  if (customerHomeZoneId === storeHomeZoneId) {
    return {customerHomeZoneId, storeHomeZoneId, pricingZoneId: customerHomeZoneId, zoneAccessType: "same_home_zone", allowed: true};
  }
  if (stringArray(store.serviceZoneIds).includes(customerHomeZoneId)) {
    return {customerHomeZoneId, storeHomeZoneId, pricingZoneId: customerHomeZoneId, zoneAccessType: "store_service_zone", allowed: true};
  }
  if (stringArray(customer.orderZoneIds).includes(storeHomeZoneId)) {
    return {customerHomeZoneId, storeHomeZoneId, pricingZoneId: storeHomeZoneId, zoneAccessType: "customer_order_zone", allowed: true};
  }
  return {customerHomeZoneId, storeHomeZoneId, pricingZoneId: null, zoneAccessType: "default_pricing", allowed: false};
}

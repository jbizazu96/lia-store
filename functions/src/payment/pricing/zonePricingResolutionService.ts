export type ZoneAccessType =
  | "same_home_zone"
  | "store_service_zone"
  | "customer_order_zone"
  | "pickup"
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

/**
 * Pickup is intentionally narrower than delivery. A customer may travel to a
 * store in their own Home Zone or in an Order Zone explicitly assigned by an
 * administrator. Store service zones only describe where the store delivers,
 * so they never grant pickup access. Route mileage is deliberately absent:
 * zone membership, rather than the delivery-radius limit, controls pickup.
 */
export function resolvePickupZoneDecision(
  customer: Record<string, unknown>,
  store: Record<string, unknown>,
): ZonePricingDecision {
  const customerHomeZoneId = stringValue(customer.homeZoneId);
  const storeHomeZoneId = stringValue(store.homeZoneId);

  if (!customerHomeZoneId || !storeHomeZoneId) {
    return {
      customerHomeZoneId,
      storeHomeZoneId,
      pricingZoneId: null,
      zoneAccessType: "default_pricing",
      allowed: false,
    };
  }

  if (customerHomeZoneId === storeHomeZoneId) {
    return {
      customerHomeZoneId,
      storeHomeZoneId,
      pricingZoneId: customerHomeZoneId,
      zoneAccessType: "same_home_zone",
      allowed: true,
    };
  }

  if (stringArray(customer.orderZoneIds).includes(storeHomeZoneId)) {
    return {
      customerHomeZoneId,
      storeHomeZoneId,
      pricingZoneId: storeHomeZoneId,
      zoneAccessType: "customer_order_zone",
      allowed: true,
    };
  }

  return {
    customerHomeZoneId,
    storeHomeZoneId,
    pricingZoneId: null,
    zoneAccessType: "default_pricing",
    allowed: false,
  };
}

export function isPickupAllowedByZoneOrDistance(
  zoneDecision: ZonePricingDecision,
  distanceMiles: number,
  maximumDistanceMiles: number,
): boolean {
  return zoneDecision.allowed || (
    Number.isFinite(distanceMiles) &&
    Number.isFinite(maximumDistanceMiles) &&
    distanceMiles >= 0 &&
    distanceMiles <= maximumDistanceMiles
  );
}

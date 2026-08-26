import type {MarketplacePricingPolicy} from "./marketplacePricingClientService";

export function isPickupLocationAllowed(
  policy: Pick<MarketplacePricingPolicy, "pickupMaximumDistanceMiles"> | null | undefined,
  pickupZoneAllowed: boolean,
  distanceMiles: number | null | undefined,
): boolean {
  if (pickupZoneAllowed) return true;
  return Boolean(
    policy &&
    typeof distanceMiles === "number" &&
    Number.isFinite(distanceMiles) &&
    distanceMiles <= policy.pickupMaximumDistanceMiles
  );
}

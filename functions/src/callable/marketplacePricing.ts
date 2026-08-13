import * as admin from "firebase-admin";
import {onCall} from "firebase-functions/v2/https";
import {getFirestore} from "firebase-admin/firestore";
import {
  parseMarketplacePricingPolicy,
  type MarketplacePricingPolicy,
} from "../payment/pricing/marketplacePricingPolicy";
import {resolveZonePricingDecision} from "../payment/pricing/zonePricingResolutionService";
import {
  ORDER_DELIVERY_POLICY_DOCUMENT,
  parseOrderDeliveryPolicy,
} from "../admin/orderDeliveryPolicy";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function storeIds(value: Record<string, unknown>): string[] {
  return [...new Set(Array.isArray(value.storeIds)
    ? value.storeIds
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim()).slice(0, 100)
    : typeof value.storeId === "string" && value.storeId.trim()
      ? [value.storeId.trim()]
      : [])];
}

function zonePolicy(
  zone: FirebaseFirestore.DocumentSnapshot | undefined,
  defaultPolicy: MarketplacePricingPolicy,
): MarketplacePricingPolicy {
  if (!zone?.exists || zone.get("isActive") !== true) return defaultPolicy;
  const maximumRouteMiles = zone.get("maximumRouteMiles");
  try {
    const policy = parseMarketplacePricingPolicy(record(zone.get("pricingPolicy")));
    return typeof maximumRouteMiles === "number"
      ? {...policy, maxRadiusMiles: maximumRouteMiles}
      : policy;
  } catch {
    return typeof maximumRouteMiles === "number"
      ? {...defaultPolicy, maxRadiusMiles: maximumRouteMiles}
      : defaultPolicy;
  }
}

export const getMarketplacePricing = onCall({region: "us-central1"}, async (request) => {
  const requestedStoreIds = storeIds(record(request.data));
  const customerReference = request.auth
    ? db.collection("users").doc(request.auth.uid)
    : null;
  const defaultPricingReference = db.collection("settings").doc("marketplacePayment");
  const orderPolicyReference = db.collection("settings").doc(ORDER_DELIVERY_POLICY_DOCUMENT);
  const storeReferences = requestedStoreIds.map((storeId) =>
    db.collection("stores").doc(storeId)
  );
  const baseSnapshots = await db.getAll(
    ...(customerReference ? [customerReference] : []),
    defaultPricingReference,
    orderPolicyReference,
    ...storeReferences,
  );
  let offset = 0;
  const customer = customerReference ? record(baseSnapshots[offset++].data()) : {};
  const defaultPolicy = parseMarketplacePricingPolicy(record(baseSnapshots[offset++].data()));
  const orderDeliveryPolicy = parseOrderDeliveryPolicy(baseSnapshots[offset++].data());
  const stores = baseSnapshots.slice(offset);

  const decisions = stores.map((snapshot) => ({
    snapshot,
    decision: snapshot.exists
      ? resolveZonePricingDecision(customer, record(snapshot.data()))
      : null,
  }));
  const uniqueZoneIds = [...new Set(decisions.flatMap(({decision}) =>
    decision?.allowed && decision.pricingZoneId ? [decision.pricingZoneId] : []
  ))];
  const zoneSnapshots = uniqueZoneIds.length > 0
    ? await db.getAll(...uniqueZoneIds.map((zoneId) =>
      db.collection("deliveryZones").doc(zoneId)
    ))
    : [];
  const policyByZoneId = new Map(uniqueZoneIds.map((zoneId, index) => [
    zoneId,
    zonePolicy(zoneSnapshots[index], defaultPolicy),
  ]));

  const entries = decisions.flatMap(({snapshot, decision}) => {
    if (!snapshot.exists || !decision) return [];
    const store = record(snapshot.data());
    const pricingZoneName = decision.pricingZoneId === decision.customerHomeZoneId
      ? (typeof customer.homeZoneName === "string" && customer.homeZoneName.trim()
        ? customer.homeZoneName.trim() : "Customer home zone")
      : decision.pricingZoneId === decision.storeHomeZoneId
        ? (typeof store.homeZoneName === "string" && store.homeZoneName.trim()
          ? store.homeZoneName.trim() : "Store home zone")
        : "Default Customer Pricing";
    const policy = decision.allowed && decision.pricingZoneId
      ? policyByZoneId.get(decision.pricingZoneId) ?? defaultPolicy
      : defaultPolicy;
    return [[snapshot.id, {
      policy,
      decision: {...decision, pricingZoneName},
    }] as const];
  });
  const byStoreId = Object.fromEntries(entries);
  const selected = requestedStoreIds.length === 1 ? byStoreId[requestedStoreIds[0]] : null;
  return {
    policy: selected?.policy ?? defaultPolicy,
    decision: selected?.decision ?? null,
    byStoreId,
    orderDeliveryPolicy,
  };
});

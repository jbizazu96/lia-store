import * as admin from "firebase-admin";
import {onCall} from "firebase-functions/v2/https";
import {getFirestore} from "firebase-admin/firestore";
import {getMarketplacePricingPolicy, getMarketplacePricingPolicyForZone} from "../payment/pricing/marketplacePricingPolicy";
import {resolveZonePricingDecision} from "../payment/pricing/zonePricingResolutionService";
if(admin.apps.length===0) admin.initializeApp();
const db = getFirestore("default");
export const getMarketplacePricing = onCall({region:"us-central1"}, async (request) => {
  const input = request.data && typeof request.data === "object" ? request.data as Record<string, unknown> : {};
  const storeIds = [...new Set(Array.isArray(input.storeIds)
    ? input.storeIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0).map((value) => value.trim()).slice(0, 100)
    : typeof input.storeId === "string" && input.storeId.trim() ? [input.storeId.trim()] : [])];
  const customer = request.auth
    ? (await db.collection("users").doc(request.auth.uid).get()).data() ?? {}
    : {};
  const defaultPolicy = await getMarketplacePricingPolicy();
  const stores = await Promise.all(storeIds.map(async (storeId) => {
    const snapshot = await db.collection("stores").doc(storeId).get();
    if (!snapshot.exists) return [storeId, null] as const;
    const decision = resolveZonePricingDecision(customer, snapshot.data() ?? {});
    const store = snapshot.data() ?? {};
    const pricingZoneName = decision.pricingZoneId === decision.customerHomeZoneId
      ? (typeof customer.homeZoneName === "string" && customer.homeZoneName.trim() ? customer.homeZoneName.trim() : "Customer home zone")
      : decision.pricingZoneId === decision.storeHomeZoneId
        ? (typeof store.homeZoneName === "string" && store.homeZoneName.trim() ? store.homeZoneName.trim() : "Store home zone")
        : "Default Customer Pricing";
    const policy = decision.allowed
      ? await getMarketplacePricingPolicyForZone(decision.pricingZoneId)
      : defaultPolicy;
    return [storeId, {policy, decision: {...decision, pricingZoneName}}] as const;
  }));
  const byStoreId = Object.fromEntries(stores.filter((entry) => entry[1] !== null));
  const selected = storeIds.length === 1 ? byStoreId[storeIds[0]] : null;
  return {policy: selected?.policy ?? defaultPolicy, decision: selected?.decision ?? null, byStoreId};
});

/*
|--------------------------------------------------------------------------
| Admin Commission Settings
|--------------------------------------------------------------------------
|
| Commission policies are private operational settings. Every mutation is
| Admin-authorized and audited; stores cannot write their own commission.
|
*/

import * as admin from "firebase-admin";
import {
  FieldPath,
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {requireAdminPermission} from "../admin/adminAuthorizationService";
import {writeAdminAuditLog} from "../admin/adminAuditLogService";
import {
  parseMarketplacePricingPolicy,
  type MarketplacePricingPolicy,
} from "../payment/pricing/marketplacePricingPolicy";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");
const DEFAULT_STORE_COMMISSION_BPS = 1_000;
const DEFAULT_DRIVER_COMMISSION_BPS = 3_000;
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
function basisPoints(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 5_000) throw new HttpsError("invalid-argument", "Commission must be a whole percentage between 0% and 50%.");
  return value;
}

export const getAdminCommissionSettings = onCall({region: "us-central1"}, async (request) => {
  await requireAdminPermission(request, "settings");
  const input = request.data && typeof request.data === "object" ? request.data as Record<string, unknown> : {};
  const cursorId = text(input.cursor);
  const cursor = cursorId ? await db.collection("stores").doc(cursorId).get() : null;
  let storeQuery = db.collection("stores").orderBy("name").limit(50);
  if (cursor?.exists) storeQuery = storeQuery.startAfter(cursor);
  const [settings, stores] = await Promise.all([
    db.collection("settings").doc("marketplacePayment").get(),
    storeQuery.get(),
  ]);
  const defaultStoreCommissionBasisPoints = typeof settings.data()?.defaultStoreCommissionBasisPoints === "number" ? settings.data()!.defaultStoreCommissionBasisPoints : DEFAULT_STORE_COMMISSION_BPS;
  const defaultDriverCommissionBasisPoints = typeof settings.data()?.defaultDriverCommissionBasisPoints === "number" ? settings.data()!.defaultDriverCommissionBasisPoints : DEFAULT_DRIVER_COMMISSION_BPS;
  return {defaultStoreCommissionBasisPoints, defaultDriverCommissionBasisPoints, stores: stores.docs.map((store) => ({id: store.id, name: text(store.data().name) || "Unnamed store", overrideBasisPoints: typeof store.data().paymentSettings?.storeCommissionBasisPoints === "number" ? store.data().paymentSettings.storeCommissionBasisPoints : null})), nextCursor: stores.size === 50 ? stores.docs.at(-1)?.id ?? null : null};
});
export const saveAdminDefaultDriverCommission = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "settings", "write");
  const value = basisPoints((request.data as {basisPoints?: unknown} | undefined)?.basisPoints);
  await db.collection("settings").doc("marketplacePayment").set({defaultDriverCommissionBasisPoints: value, updatedAt: FieldValue.serverTimestamp(), updatedBy: administrator.uid}, {merge: true});
  await writeAdminAuditLog(administrator, {action: "marketplace.default_driver_commission_updated", targetType: "settings", targetId: "marketplacePayment", details: {basisPoints: value}});
  return {success: true};
});
export const saveAdminMarketplacePricingPolicy = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "settings", "write");
  const input = (request.data as {policy?: Record<string, unknown>} | undefined)?.policy ?? {};
  let policy: MarketplacePricingPolicy;
  try {
    policy = parseMarketplacePricingPolicy(input);
  } catch {
    throw new HttpsError("invalid-argument", "Enter a complete valid marketplace pricing policy.");
  }
  await db.collection("settings").doc("marketplacePayment").set({
    ...policy,
    salesTaxRate: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: administrator.uid,
  }, {merge:true});
  await writeAdminAuditLog(administrator, {
    action: "marketplace.pricing_policy_updated",
    targetType: "settings",
    targetId: "marketplacePayment",
    details: {
      serviceFeeRate: policy.serviceFeeRate,
      freeDeliveryMinimumCents: policy.freeDeliveryMinimumCents,
      peakSurchargeEnabled: policy.peakSurchargeEnabled,
      peakSurchargeCents: policy.peakSurchargeCents,
      pickupEnabled: policy.pickupEnabled,
      pickupMaximumDistanceMiles: policy.pickupMaximumDistanceMiles,
      pickupServiceFeeRate: policy.pickupServiceFeeRate,
      pickupMinimumServiceFeeCents: policy.pickupMinimumServiceFeeCents,
      pickupMaximumServiceFeeCents: policy.pickupMaximumServiceFeeCents,
    },
  });
  return {success:true};
});

export const getAdminMarketplacePricingPolicy = onCall(
  {region: "us-central1"},
  async (request) => {
    await requireAdminPermission(request, "settings");
    const settings = await db.collection("settings")
      .doc("marketplacePayment").get();
    try {
      return {policy: parseMarketplacePricingPolicy(settings.data() ?? {})};
    } catch {
      return {policy: null};
    }
  },
);

export const saveAdminDefaultStoreCommission = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "settings", "write");
  const value = basisPoints((request.data as {basisPoints?: unknown} | undefined)?.basisPoints);
  await db.collection("settings").doc("marketplacePayment").set({defaultStoreCommissionBasisPoints: value, updatedAt: FieldValue.serverTimestamp(), updatedBy: administrator.uid}, {merge: true});
  await writeAdminAuditLog(administrator, {action: "marketplace.default_store_commission_updated", targetType: "settings", targetId: "marketplacePayment", details: {basisPoints: value}});
  return {success: true};
});

export const saveAdminStoreCommissionOverride = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "settings", "write");
  const input = request.data as {storeId?: unknown; basisPoints?: unknown} | undefined;
  const storeId = text(input?.storeId); if (!storeId) throw new HttpsError("invalid-argument", "A store is required.");
  const store = db.collection("stores").doc(storeId); if (!(await store.get()).exists) throw new HttpsError("not-found", "The store was not found.");
  const value = input?.basisPoints === null ? null : basisPoints(input?.basisPoints);
  /*
   * update() interprets dotted keys as nested field paths. set(..., merge)
   * does not provide that same guarantee, which could leave a literal field
   * named "paymentSettings.storeCommissionBasisPoints" at the document root.
   *
   * Remove that malformed legacy field during the same Admin-authorized
   * update so the settlement service and settings UI read one source of truth.
   */
  await store.update(
    new FieldPath(
      "paymentSettings.storeCommissionBasisPoints"
    ),
    FieldValue.delete(),
    "paymentSettings.storeCommissionBasisPoints",
    value,
    "paymentSettings.updatedAt",
    FieldValue.serverTimestamp(),
  );
  await writeAdminAuditLog(administrator, {action: "store.commission_override_updated", targetType: "store", targetId: storeId, details: {basisPoints: value}});
  return {success: true};
});

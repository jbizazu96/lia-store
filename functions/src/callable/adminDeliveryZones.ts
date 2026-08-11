/*
|--------------------------------------------------------------------------
| Admin Delivery Zones
|--------------------------------------------------------------------------
|
| Delivery zones group nearby cities into one operational marketplace area.
| Only trusted admin callables can mutate them. A deterministic city-assignment
| document prevents the same city/state pair from belonging to two zones.
|
*/

import * as admin from "firebase-admin";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import {
  requireActiveAdmin,
} from "../admin/adminAuthorizationService";
import {
  writeAdminAuditLog,
} from "../admin/adminAuditLogService";
import {
  parseMarketplacePricingPolicy,
  type MarketplacePricingPolicy,
} from "../payment/pricing/marketplacePricingPolicy";
import {resolveDeliveryZoneForAddress} from "../delivery/deliveryZoneAssignmentService";

if (admin.apps.length === 0) admin.initializeApp();

const db = getFirestore("default");
const MAXIMUM_ZONE_ROUTE_MILES = 25;
const MAXIMUM_CITIES_PER_ZONE = 100;
const US_TIME_ZONES = new Set([
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "America/Adak",
  "Pacific/Honolulu",
  "America/Puerto_Rico",
]);
const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC", "PR",
]);

interface ZoneCity {
  key: string;
  name: string;
  stateCode: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function stateCode(value: unknown): string {
  const state = text(value, 2).toUpperCase();
  if (!US_STATE_CODES.has(state)) {
    throw new HttpsError("invalid-argument", "Choose a valid U.S. state or territory.");
  }
  return state;
}

function cityName(value: unknown): string {
  const city = text(value, 80).replace(/\s+/g, " ");
  if (city.length < 2 || !/[A-Za-z]/.test(city)) {
    throw new HttpsError("invalid-argument", "Enter a valid city name.");
  }
  return city;
}

function cityKey(city: string, state: string): string {
  const slug = city
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug) throw new HttpsError("invalid-argument", "Enter a valid city name.");
  return `${state.toLowerCase()}_${slug}`;
}

function zoneInput(value: unknown) {
  const input = record(value);
  const name = text(input.name, 80).replace(/\s+/g, " ");
  const description = text(input.description, 300);
  const primaryStateCode = stateCode(input.primaryStateCode);
  const timeZone = text(input.timeZone, 64);
  const maximumRouteMiles = Number(input.maximumRouteMiles);
  const postalCodes = Array.isArray(input.postalCodes)
    ? [...new Set(input.postalCodes.map((value) => text(value, 10).toUpperCase()).filter((value) => /^\d{5}(?:-\d{4})?$/.test(value)))]
    : [];
  const placeIds = Array.isArray(input.placeIds)
    ? [...new Set(input.placeIds.map((value) => text(value, 200)).filter(Boolean))]
    : [];

  if (name.length < 3) {
    throw new HttpsError("invalid-argument", "Zone name must contain at least 3 characters.");
  }
  if (!US_TIME_ZONES.has(timeZone)) {
    throw new HttpsError("invalid-argument", "Choose a supported U.S. time zone.");
  }
  if (!Number.isInteger(maximumRouteMiles) || maximumRouteMiles < 1 ||
    maximumRouteMiles > MAXIMUM_ZONE_ROUTE_MILES) {
    throw new HttpsError(
      "invalid-argument",
      `Maximum route distance must be a whole number from 1 to ${MAXIMUM_ZONE_ROUTE_MILES} miles.`,
    );
  }

  return {
    name,
    description: description || null,
    primaryStateCode,
    timeZone,
    maximumRouteMiles,
    isActive: input.isActive === true,
    postalCodes,
    placeIds,
  };
}

function timestamp(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value &&
    typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date ? date.toISOString() : null;
  }
  return null;
}

function cities(value: unknown): ZoneCity[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const data = record(item);
    const key = text(data.key, 100);
    const name = text(data.name, 80);
    const state = text(data.stateCode, 2).toUpperCase();
    return key && name && US_STATE_CODES.has(state)
      ? [{key, name, stateCode: state}]
      : [];
  }).sort((first, second) =>
    first.stateCode.localeCompare(second.stateCode) || first.name.localeCompare(second.name)
  );
}

async function ensureUniqueZoneMatchers(
  excludedZoneId: string | null,
  postalCodes: string[],
  placeIds: string[],
): Promise<void> {
  if (postalCodes.length === 0 && placeIds.length === 0) return;
  const snapshot = await db.collection("deliveryZones").limit(250).get();
  for (const document of snapshot.docs) {
    if (document.id === excludedZoneId) continue;
    const data = document.data();
    const existingPostalCodes = Array.isArray(data.postalCodes) ? data.postalCodes : [];
    const existingPlaceIds = Array.isArray(data.placeIds) ? data.placeIds : [];
    const duplicatePostal = postalCodes.find((value) => existingPostalCodes.includes(value));
    const duplicatePlace = placeIds.find((value) => existingPlaceIds.includes(value));
    if (duplicatePostal || duplicatePlace) {
      throw new HttpsError(
        "already-exists",
        `${duplicatePostal ? `ZIP ${duplicatePostal}` : "A Google place ID"} already belongs to ${text(data.name, 80) || "another delivery zone"}.`,
      );
    }
  }
}

function toClient(id: string, data: Record<string, unknown>) {
  return {
    id,
    name: text(data.name, 80),
    description: text(data.description, 300) || null,
    primaryStateCode: text(data.primaryStateCode, 2).toUpperCase(),
    timeZone: text(data.timeZone, 64),
    maximumRouteMiles: typeof data.maximumRouteMiles === "number"
      ? data.maximumRouteMiles
      : MAXIMUM_ZONE_ROUTE_MILES,
    isActive: data.isActive === true,
    cities: cities(data.cities),
    postalCodes: Array.isArray(data.postalCodes) ? data.postalCodes.filter((value): value is string => typeof value === "string") : [],
    placeIds: Array.isArray(data.placeIds) ? data.placeIds.filter((value): value is string => typeof value === "string") : [],
    createdAt: timestamp(data.createdAt),
    updatedAt: timestamp(data.updatedAt),
  };
}

export const getAdminDeliveryZones = onCall(
  {region: "us-central1"},
  async (request) => {
    await requireActiveAdmin(request);
    const snapshot = await db.collection("deliveryZones").orderBy("name").limit(250).get();
    return {zones: snapshot.docs.map((document) => toClient(document.id, document.data()))};
  },
);

export const createAdminDeliveryZone = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireActiveAdmin(request);
    const zone = zoneInput(record(request.data).zone);
    await ensureUniqueZoneMatchers(null, zone.postalCodes, zone.placeIds);
    const reference = db.collection("deliveryZones").doc();
    await reference.create({
      ...zone,
      cities: [],
      cityKeys: [],
      createdAt: FieldValue.serverTimestamp(),
      createdBy: administrator.uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: administrator.uid,
    });
    await writeAdminAuditLog(administrator, {
      action: "delivery_zone.created",
      targetType: "deliveryZone",
      targetId: reference.id,
      details: {
        name: zone.name,
        primaryStateCode: zone.primaryStateCode,
        maximumRouteMiles: zone.maximumRouteMiles,
        isActive: zone.isActive,
      },
    });
    return {id: reference.id};
  },
);

export const updateAdminDeliveryZone = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireActiveAdmin(request);
    const input = record(request.data);
    const id = text(input.id, 128);
    const zone = zoneInput(input.zone);
    if (!id) throw new HttpsError("invalid-argument", "Delivery zone is required.");
    const reference = db.collection("deliveryZones").doc(id);
    const snapshot = await reference.get();
    if (!snapshot.exists) {
      throw new HttpsError("not-found", "Delivery zone not found.");
    }
    await ensureUniqueZoneMatchers(id, zone.postalCodes, zone.placeIds);
    const existingPricing = record(snapshot.data()?.pricingPolicy);
    const hasPricingOverride = Object.keys(existingPricing).length > 0;
    const batch = db.batch();
    batch.update(reference, {
      ...zone,
      ...(hasPricingOverride
        ? {"pricingPolicy.maxRadiusMiles": zone.maximumRouteMiles}
        : {}),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: administrator.uid,
    });
    for (const city of cities(snapshot.data()?.cities)) {
      batch.update(db.collection("deliveryZoneCityAssignments").doc(city.key), {
        zoneName: zone.name,
      });
    }
    await batch.commit();
    await writeAdminAuditLog(administrator, {
      action: "delivery_zone.updated",
      targetType: "deliveryZone",
      targetId: id,
      details: {name: zone.name, maximumRouteMiles: zone.maximumRouteMiles, isActive: zone.isActive},
    });
    return {success: true};
  },
);

export const addAdminDeliveryZoneCity = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireActiveAdmin(request);
    const input = record(request.data);
    const zoneId = text(input.zoneId, 128);
    const name = cityName(input.cityName);
    const state = stateCode(input.stateCode);
    const key = cityKey(name, state);
    if (!zoneId) throw new HttpsError("invalid-argument", "Delivery zone is required.");

    const zoneReference = db.collection("deliveryZones").doc(zoneId);
    const assignmentReference = db.collection("deliveryZoneCityAssignments").doc(key);
    await db.runTransaction(async (transaction) => {
      const [zoneSnapshot, assignmentSnapshot] = await Promise.all([
        transaction.get(zoneReference),
        transaction.get(assignmentReference),
      ]);
      if (!zoneSnapshot.exists) throw new HttpsError("not-found", "Delivery zone not found.");
      if (assignmentSnapshot.exists) {
        const assignment = assignmentSnapshot.data();
        const assignedZoneName = text(assignment?.zoneName, 80) || "another delivery zone";
        if (assignment?.zoneId === zoneId) {
          throw new HttpsError("already-exists", `${name}, ${state} is already in this zone.`);
        }
        throw new HttpsError("already-exists", `${name}, ${state} already belongs to ${assignedZoneName}.`);
      }
      const currentCities = cities(zoneSnapshot.data()?.cities);
      if (currentCities.length >= MAXIMUM_CITIES_PER_ZONE) {
        throw new HttpsError("resource-exhausted", "A delivery zone can contain at most 100 cities.");
      }
      const city = {key, name, stateCode: state};
      transaction.update(zoneReference, {
        cities: [...currentCities, city],
        cityKeys: FieldValue.arrayUnion(key),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: administrator.uid,
      });
      transaction.create(assignmentReference, {
        cityName: name,
        stateCode: state,
        zoneId,
        zoneName: text(zoneSnapshot.data()?.name, 80),
        createdAt: FieldValue.serverTimestamp(),
        createdBy: administrator.uid,
      });
    });
    await writeAdminAuditLog(administrator, {
      action: "delivery_zone.city_added",
      targetType: "deliveryZone",
      targetId: zoneId,
      details: {city: name, stateCode: state},
    });
    return {success: true};
  },
);

export const removeAdminDeliveryZoneCity = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireActiveAdmin(request);
    const input = record(request.data);
    const zoneId = text(input.zoneId, 128);
    const key = text(input.cityKey, 100);
    if (!zoneId || !key) throw new HttpsError("invalid-argument", "Zone and city are required.");
    const zoneReference = db.collection("deliveryZones").doc(zoneId);
    const assignmentReference = db.collection("deliveryZoneCityAssignments").doc(key);
    let removed: ZoneCity | null = null;
    await db.runTransaction(async (transaction) => {
      const [zoneSnapshot, assignmentSnapshot] = await Promise.all([
        transaction.get(zoneReference),
        transaction.get(assignmentReference),
      ]);
      if (!zoneSnapshot.exists) throw new HttpsError("not-found", "Delivery zone not found.");
      const currentCities = cities(zoneSnapshot.data()?.cities);
      removed = currentCities.find((city) => city.key === key) ?? null;
      if (!removed || !assignmentSnapshot.exists || assignmentSnapshot.data()?.zoneId !== zoneId) {
        throw new HttpsError("not-found", "City assignment not found.");
      }
      transaction.update(zoneReference, {
        cities: currentCities.filter((city) => city.key !== key),
        cityKeys: FieldValue.arrayRemove(key),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: administrator.uid,
      });
      transaction.delete(assignmentReference);
    });
    await writeAdminAuditLog(administrator, {
      action: "delivery_zone.city_removed",
      targetType: "deliveryZone",
      targetId: zoneId,
      details: {cityKey: key},
    });
    return {success: true};
  },
);

async function zoneUsage(zoneId: string): Promise<string | null> {
  const [homeStore, serviceStore, homeDriver, serviceDriver, customerHome, customerOrder, defaultAddress, topLevelAddress] = await Promise.all([
    db.collection("stores").where("homeZoneId", "==", zoneId).limit(1).get(),
    db.collection("stores").where("serviceZoneIds", "array-contains", zoneId).limit(1).get(),
    db.collection("drivers").where("homeZoneId", "==", zoneId).limit(1).get(),
    db.collection("drivers").where("serviceZoneIds", "array-contains", zoneId).limit(1).get(),
    db.collection("users").where("homeZoneId", "==", zoneId).limit(1).get(),
    db.collection("users").where("orderZoneIds", "array-contains", zoneId).limit(1).get(),
    db.collection("users").where("defaultAddress.deliveryZoneId", "==", zoneId).limit(1).get(),
    db.collection("addresses").where("deliveryZoneId", "==", zoneId).limit(1).get(),
  ]);
  if (!homeStore.empty || !serviceStore.empty) return "one or more stores";
  if (!homeDriver.empty || !serviceDriver.empty) return "one or more drivers";
  if (!customerHome.empty || !customerOrder.empty || !defaultAddress.empty || !topLevelAddress.empty) return "one or more customers";
  return null;
}

export const deleteAdminDeliveryZone = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireActiveAdmin(request);
    const id = text(record(request.data).id, 128);
    if (!id) throw new HttpsError("invalid-argument", "Delivery zone is required.");
    const reference = db.collection("deliveryZones").doc(id);
    const snapshot = await reference.get();
    if (!snapshot.exists) throw new HttpsError("not-found", "Delivery zone not found.");
    const usedBy = await zoneUsage(id);
    if (usedBy) {
      throw new HttpsError(
        "failed-precondition",
        `This zone is still assigned to ${usedBy}. Reassign them before deleting it.`,
      );
    }
    const zoneCities = cities(snapshot.data()?.cities);
    const batch = db.batch();
    for (const city of zoneCities) {
      batch.delete(db.collection("deliveryZoneCityAssignments").doc(city.key));
    }
    batch.delete(reference);
    await batch.commit();
    await writeAdminAuditLog(administrator, {
      action: "delivery_zone.deleted",
      targetType: "deliveryZone",
      targetId: id,
      details: {name: text(snapshot.data()?.name, 80), cityCount: zoneCities.length},
    });
    return {success: true};
  },
);

function pricingPolicy(value: unknown): MarketplacePricingPolicy {
  try {
    return parseMarketplacePricingPolicy(record(value));
  } catch {
    throw new HttpsError("invalid-argument", "Enter a complete valid customer pricing policy.");
  }
}

export const getAdminDeliveryZonePricing = onCall(
  {region: "us-central1"},
  async (request) => {
    await requireActiveAdmin(request);
    const zoneId = text(record(request.data).zoneId, 128);
    if (!zoneId) throw new HttpsError("invalid-argument", "Delivery zone is required.");
    const [zoneSnapshot, defaultSnapshot] = await Promise.all([
      db.collection("deliveryZones").doc(zoneId).get(),
      db.collection("settings").doc("marketplacePayment").get(),
    ]);
    if (!zoneSnapshot.exists) throw new HttpsError("not-found", "Delivery zone not found.");

    const zoneData = zoneSnapshot.data() ?? {};
    const maximumRouteMiles = typeof zoneData.maximumRouteMiles === "number"
      ? zoneData.maximumRouteMiles
      : MAXIMUM_ZONE_ROUTE_MILES;
    let inherited = false;
    let policy: MarketplacePricingPolicy;
    try {
      policy = parseMarketplacePricingPolicy(record(zoneData.pricingPolicy));
    } catch {
      inherited = true;
      try {
        policy = parseMarketplacePricingPolicy(defaultSnapshot.data() ?? {});
      } catch {
        throw new HttpsError(
          "failed-precondition",
          "Configure the platform customer-pricing defaults before editing zone pricing.",
        );
      }
    }

    return {
      zone: {
        id: zoneSnapshot.id,
        name: text(zoneData.name, 80),
        primaryStateCode: text(zoneData.primaryStateCode, 2),
        maximumRouteMiles,
      },
      policy: {...policy, maxRadiusMiles: maximumRouteMiles},
      inherited,
    };
  },
);

export const saveAdminDeliveryZonePricing = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireActiveAdmin(request);
    const input = record(request.data);
    const zoneId = text(input.zoneId, 128);
    if (!zoneId) throw new HttpsError("invalid-argument", "Delivery zone is required.");
    const reference = db.collection("deliveryZones").doc(zoneId);
    const snapshot = await reference.get();
    if (!snapshot.exists) throw new HttpsError("not-found", "Delivery zone not found.");
    const maximumRouteMiles = typeof snapshot.data()?.maximumRouteMiles === "number"
      ? snapshot.data()!.maximumRouteMiles
      : MAXIMUM_ZONE_ROUTE_MILES;
    const policy = {
      ...pricingPolicy(input.policy),
      maxRadiusMiles: maximumRouteMiles,
    };
    await reference.update({
      pricingPolicy: policy,
      pricingUpdatedAt: FieldValue.serverTimestamp(),
      pricingUpdatedBy: administrator.uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: administrator.uid,
    });
    await writeAdminAuditLog(administrator, {
      action: "delivery_zone.pricing_updated",
      targetType: "deliveryZone",
      targetId: zoneId,
      details: {
        zoneName: text(snapshot.data()?.name, 80),
        maximumRouteMiles,
        baseDeliveryFeeCents: policy.baseDeliveryFeeCents,
        serviceFeeRate: policy.serviceFeeRate,
        peakSurchargeCents: policy.peakSurchargeCents,
      },
    });
    return {success: true};
  },
);

export const resetAdminDeliveryZonePricing = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireActiveAdmin(request);
    const zoneId = text(record(request.data).zoneId, 128);
    if (!zoneId) throw new HttpsError("invalid-argument", "Delivery zone is required.");
    const reference = db.collection("deliveryZones").doc(zoneId);
    const snapshot = await reference.get();
    if (!snapshot.exists) throw new HttpsError("not-found", "Delivery zone not found.");
    await reference.update({
      pricingPolicy: FieldValue.delete(),
      pricingUpdatedAt: FieldValue.delete(),
      pricingUpdatedBy: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: administrator.uid,
    });
    await writeAdminAuditLog(administrator, {
      action: "delivery_zone.pricing_reset",
      targetType: "deliveryZone",
      targetId: zoneId,
      details: {zoneName: text(snapshot.data()?.name, 80)},
    });
    return {success: true};
  },
);

export const setAdminAccountZoneAssignment = onCall(
  {region: "us-central1"},
  async (request) => {
    const administrator = await requireActiveAdmin(request);
    const input = record(request.data);
    const accountType = text(input.accountType, 20);
    const accountId = text(input.accountId, 128);
    const homeZoneId = text(input.homeZoneId, 128) || null;
    const requestedServiceIds = Array.isArray(input.serviceZoneIds)
      ? input.serviceZoneIds.map((value) => text(value, 128)).filter(Boolean)
      : [];
    const requestedOrderIds = Array.isArray(input.orderZoneIds)
      ? input.orderZoneIds.map((value) => text(value, 128)).filter(Boolean)
      : [];
    const serviceZoneIds = [...new Set(requestedServiceIds)]
      .filter((zoneId) => zoneId !== homeZoneId);
    const orderZoneIds = [...new Set(requestedOrderIds)]
      .filter((zoneId) => zoneId !== homeZoneId);
    if (!accountId || !["customer", "store", "driver"].includes(accountType)) {
      throw new HttpsError("invalid-argument", "Choose a valid account and zone assignment.");
    }
    if (accountType === "customer" && serviceZoneIds.length > 0) {
      throw new HttpsError("invalid-argument", "Customers cannot have service zones.");
    }
    if (accountType !== "customer" && orderZoneIds.length > 0) {
      throw new HttpsError("invalid-argument", "Order zones are available only for customers.");
    }
    const zoneIds = [...new Set([homeZoneId, ...serviceZoneIds, ...orderZoneIds].filter((value): value is string => Boolean(value)))];
    const zoneSnapshots = await Promise.all(zoneIds.map((zoneId) =>
      db.collection("deliveryZones").doc(zoneId).get()
    ));
    if (zoneSnapshots.some((zone) => !zone.exists || zone.data()?.isActive !== true)) {
      throw new HttpsError("failed-precondition", "Every assigned zone must exist and be active.");
    }
    const zoneNames = new Map(zoneSnapshots.map((zone) => [
      zone.id,
      text(zone.data()?.name, 80) || "Delivery zone",
    ]));
    const collection = accountType === "customer" ? "users" : accountType === "store" ? "stores" : "drivers";
    const reference = db.collection(collection).doc(accountId);
    const snapshot = await reference.get();
    if (!snapshot.exists || (accountType === "customer" && snapshot.data()?.accountType !== "customer")) {
      throw new HttpsError("not-found", "The account was not found.");
    }
    const update: Record<string, unknown> = {
      homeZoneId,
      homeZoneName: homeZoneId ? zoneNames.get(homeZoneId) ?? null : null,
      ...(accountType === "customer" ? {} : {
        serviceZoneIds,
        serviceZoneNames: serviceZoneIds.map((zoneId) => zoneNames.get(zoneId) ?? "Delivery zone"),
      }),
      ...(accountType === "customer" ? {
        orderZoneIds,
        orderZoneNames: orderZoneIds.map((zoneId) => zoneNames.get(zoneId) ?? "Delivery zone"),
      } : {}),
      zoneAssignmentSource: "admin",
      zoneAssignmentUpdatedAt: FieldValue.serverTimestamp(),
      zoneAssignmentUpdatedBy: administrator.uid,
      updatedAt: FieldValue.serverTimestamp(),
    };
    const addressKey = accountType === "customer" ? "defaultAddress" : accountType === "driver" ? "address" : null;
    if (addressKey && Object.keys(record(snapshot.data()?.[addressKey])).length > 0) {
      update[`${addressKey}.deliveryZoneId`] = homeZoneId;
      update[`${addressKey}.deliveryZoneName`] = homeZoneId ? zoneNames.get(homeZoneId) ?? null : null;
    }
    await reference.update(update);
    if (accountType === "customer") {
      const addressReference = reference.collection("addresses").doc("default");
      if ((await addressReference.get()).exists) {
        await addressReference.update({
          deliveryZoneId: homeZoneId,
          deliveryZoneName: homeZoneId ? zoneNames.get(homeZoneId) ?? null : null,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      const pendingRequests = await db.collection("orderZoneRequests")
        .where("customerId", "==", accountId).limit(20).get();
      const resolvedWriter = db.bulkWriter();
      pendingRequests.docs.forEach((document) => {
        const requestedZoneId = text(document.data().storeHomeZoneId, 128);
        if (document.data().status === "pending_review" && requestedZoneId && orderZoneIds.includes(requestedZoneId)) {
          resolvedWriter.update(document.ref, {
            status: "approved",
            resolvedAt: FieldValue.serverTimestamp(),
            resolvedBy: administrator.uid,
            updatedAt: FieldValue.serverTimestamp(),
          });
          resolvedWriter.set(reference.collection("notifications").doc(`order-zone-${document.id}`), {
            title: "Order Zone approved",
            body: "LIA Support approved your Order Zone request. You can now shop from stores in that zone when they are within the delivery-distance limit.",
            type: "system",
            deepLink: "/home",
            read: false,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
        }
      });
      await resolvedWriter.close();
    }
    await writeAdminAuditLog(administrator, {
      action: "account_zone_assignment.updated",
      targetType: accountType,
      targetId: accountId,
      details: {homeZoneId, serviceZoneIds: serviceZoneIds.join(","), orderZoneIds: orderZoneIds.join(",")},
    });
    return {success: true};
  },
);

interface BackfillCount {
  scanned: number;
  matched: number;
  defaultPricing: number;
  skippedAdmin: number;
  missingAddress: number;
}

function emptyBackfillCount(): BackfillCount {
  return {scanned: 0, matched: 0, defaultPricing: 0, skippedAdmin: 0, missingAddress: 0};
}

async function backfillCollection(
  collectionName: "users" | "stores" | "drivers",
  accountType: "customer" | "store" | "driver",
): Promise<BackfillCount> {
  const result = emptyBackfillCount();
  const snapshot = await db.collection(collectionName).get();
  const writer = db.bulkWriter();
  for (const document of snapshot.docs) {
    const data = document.data();
    if (accountType === "customer" && data.accountType !== "customer" && data.role !== "customer") continue;
    result.scanned += 1;
    if (data.zoneAssignmentSource === "admin") {
      result.skippedAdmin += 1;
      continue;
    }
    const address = accountType === "customer"
      ? record(data.defaultAddress)
      : accountType === "driver" ? record(data.address) : data;
    const city = text(address.city, 80);
    const state = text(address.state, 2);
    const zip = text(address.zip ?? address.zipCode, 10);
    const placeId = text(address.placeId, 200);
    if (!city || !state) {
      result.missingAddress += 1;
      continue;
    }
    const zone = await resolveDeliveryZoneForAddress(city, state, zip, placeId);
    const update: Record<string, unknown> = {
      homeZoneId: zone?.id ?? null,
      homeZoneName: zone?.name ?? null,
      zoneAssignmentSource: "automatic_backfill",
      zoneAssignmentUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (accountType === "customer") {
      update["defaultAddress.deliveryZoneId"] = zone?.id ?? null;
      update["defaultAddress.deliveryZoneName"] = zone?.name ?? null;
      writer.set(document.ref.collection("addresses").doc("default"), {
        deliveryZoneId: zone?.id ?? null,
        deliveryZoneName: zone?.name ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
    } else if (accountType === "driver") {
      update["address.deliveryZoneId"] = zone?.id ?? null;
      update["address.deliveryZoneName"] = zone?.name ?? null;
    }
    writer.set(document.ref, update, {merge: true});
    if (zone) result.matched += 1;
    else result.defaultPricing += 1;
  }
  await writer.close();
  return result;
}

export const backfillAdminDeliveryZoneAssignments = onCall(
  {region: "us-central1", timeoutSeconds: 540, memory: "1GiB"},
  async (request) => {
    const administrator = await requireActiveAdmin(request);
    const [customers, stores, drivers] = await Promise.all([
      backfillCollection("users", "customer"),
      backfillCollection("stores", "store"),
      backfillCollection("drivers", "driver"),
    ]);
    await writeAdminAuditLog(administrator, {
      action: "delivery_zone.assignments_backfilled",
      targetType: "deliveryZone",
      targetId: "all",
      details: {
        customersScanned: customers.scanned,
        customersMatched: customers.matched,
        customersDefaultPricing: customers.defaultPricing,
        storesScanned: stores.scanned,
        storesMatched: stores.matched,
        storesDefaultPricing: stores.defaultPricing,
        driversScanned: drivers.scanned,
        driversMatched: drivers.matched,
        driversDefaultPricing: drivers.defaultPricing,
      },
    });
    return {success: true, customers, stores, drivers};
  },
);

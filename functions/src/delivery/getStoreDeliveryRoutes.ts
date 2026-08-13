/*
|--------------------------------------------------------------------------
| Customer Store Delivery Routes
|--------------------------------------------------------------------------
|
| Calculates Google Routes driving distances for one customer address and
| one or more store IDs. Store coordinates are read from Firestore so the
| browser never supplies a store location or a chargeable distance.
|
*/

import {createHash} from "node:crypto";
import {
  FieldValue,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {
  checkoutDistanceService,
  hasValidCheckoutCoordinates,
} from "../payment/checkout/checkoutDistanceService";
import {enforceCallableAbuseProtection} from "../security/callableAbuseProtection";

const db = getFirestore("default");

const googleMapsApiKey =
  defineSecret("GOOGLE_MAPS_API_KEY");

const MAX_STORE_IDS = 50;
const ROUTE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ROUTE_CACHE_COLLECTION = "deliveryRouteCache";
const ROUTE_CACHE_CLEANUP_LIMIT = 5000;

interface DeliveryRouteRequest {
  storeIds?: unknown;
  destination?: unknown;
}

interface RouteCoordinates {
  latitude: number;
  longitude: number;
}

interface DeliveryRouteResult {
  storeId: string;
  distanceMiles: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function parseCoordinates(value: unknown): RouteCoordinates {
  if (!isRecord(value)) {
    throw new HttpsError(
      "invalid-argument",
      "A valid delivery address is required."
    );
  }

  const latitude = value.latitude;
  const longitude = value.longitude;

  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !hasValidCheckoutCoordinates({
      latitude,
      longitude,
    })
  ) {
    throw new HttpsError(
      "invalid-argument",
      "The delivery address needs valid map coordinates."
    );
  }

  return {latitude, longitude};
}

function parseStoreIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "At least one store is required."
    );
  }

  if (value.length > MAX_STORE_IDS) {
    throw new HttpsError(
      "invalid-argument",
      "A maximum of " + MAX_STORE_IDS + " stores can be checked at once."
    );
  }

  const storeIds = [
    ...new Set(
      value
        .filter(
          (storeId): storeId is string =>
            typeof storeId === "string" &&
            storeId.trim().length > 0
        )
        .map((storeId) => storeId.trim())
    ),
  ];

  if (storeIds.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "At least one valid store is required."
    );
  }

  return storeIds;
}

function coordinateKey(value: number): string {
  return value.toFixed(6);
}

function routeCacheId(
  storeId: string,
  origin: RouteCoordinates,
  destination: RouteCoordinates,
): string {
  return createHash("sha256").update([
    storeId,
    coordinateKey(origin.latitude),
    coordinateKey(origin.longitude),
    coordinateKey(destination.latitude),
    coordinateKey(destination.longitude),
  ].join(":"), "utf8").digest("hex");
}

function cachedDistance(
  snapshot: FirebaseFirestore.DocumentSnapshot,
  now: number,
): number | null {
  const expiresAt = snapshot.get("expiresAt");
  const distanceMiles = snapshot.get("distanceMiles");
  return snapshot.exists &&
    expiresAt instanceof Timestamp &&
    expiresAt.toMillis() > now &&
    typeof distanceMiles === "number" &&
    Number.isFinite(distanceMiles) &&
    distanceMiles >= 0
    ? distanceMiles
    : null;
}

export const getStoreDeliveryRoutes =
  onCall(
    {
      region: "us-central1",
      secrets: [googleMapsApiKey],
      maxInstances: 10,
      timeoutSeconds: 60,
    },
    async (request) => {
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "You must be signed in to calculate delivery routes."
        );
      }

      await enforceCallableAbuseProtection({
        operation: "store-delivery-routes",
        uid: request.auth.uid,
        appCheckVerified: Boolean(request.app),
        maximumRequests: 30,
        windowSeconds: 60,
      });

      const input = request.data as DeliveryRouteRequest;
      const storeIds = parseStoreIds(input.storeIds);
      const destination = parseCoordinates(input.destination);

      const storeSnapshots = await db.getAll(
        ...storeIds.map((storeId) =>
          db.collection("stores").doc(storeId)
        )
      );

      const validStores = storeSnapshots.flatMap((storeSnapshot) => {
        if (!storeSnapshot.exists) return [];
        const store = storeSnapshot.data();
        const latitude = store?.latitude;
        const longitude = store?.longitude;
        if (
          store?.isApproved !== true ||
          store?.isActive !== true ||
          typeof latitude !== "number" ||
          typeof longitude !== "number" ||
          !hasValidCheckoutCoordinates({latitude, longitude})
        ) return [];
        const origin = {latitude, longitude};
        const cacheId = routeCacheId(storeSnapshot.id, origin, destination);
        return [{storeId: storeSnapshot.id, origin, cacheId}];
      });

      const cacheSnapshots = validStores.length > 0
        ? await db.getAll(...validStores.map((store) =>
          db.collection(ROUTE_CACHE_COLLECTION).doc(store.cacheId)
        ))
        : [];
      const now = Date.now();
      const routes: DeliveryRouteResult[] = [];
      const missingStores = validStores.filter((store, index) => {
        const distanceMiles = cachedDistance(cacheSnapshots[index], now);
        if (distanceMiles === null) return true;
        routes.push({storeId: store.storeId, distanceMiles});
        return false;
      });

      let matrixDistances: Array<number | null> = [];
      if (missingStores.length > 0) {
        try {
          matrixDistances = await checkoutDistanceService
            .getTrustedDrivingDistanceMatrixMiles(
              missingStores.map((store) => store.origin),
              destination,
              googleMapsApiKey.value(),
            );
        } catch (error) {
          console.error("Google Route Matrix could not calculate delivery routes:", error);
          matrixDistances = missingStores.map(() => null);
        }
      }

      const freshRoutes = (await Promise.all(missingStores.map(async (store, index) => {
        const matrixDistance = matrixDistances[index];
        if (matrixDistance !== null && matrixDistance !== undefined) {
          return {...store, distanceMiles: matrixDistance};
        }
        /* Preserve availability if one matrix element has no route. */
        try {
          const distanceMiles = await checkoutDistanceService
            .getTrustedDrivingDistanceMiles(
              store.origin,
              destination,
              googleMapsApiKey.value()
            );
          return {...store, distanceMiles};
        } catch (error) {
          console.error(
            "Google Routes could not calculate a store delivery route:",
            {storeId: store.storeId, error}
          );
          return null;
        }
      }))).filter((route): route is NonNullable<typeof route> => route !== null);

      if (freshRoutes.length > 0) {
        const batch = db.batch();
        freshRoutes.forEach((route) => {
          batch.set(db.collection(ROUTE_CACHE_COLLECTION).doc(route.cacheId), {
            storeId: route.storeId,
            distanceMiles: route.distanceMiles,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            expiresAt: Timestamp.fromMillis(now + ROUTE_CACHE_TTL_MS),
          });
          routes.push({
            storeId: route.storeId,
            distanceMiles: route.distanceMiles,
          });
        });
        await batch.commit();
      }

      if (routes.length === 0) {
        throw new HttpsError(
          "unavailable",
          "Delivery routes could not be calculated. Please try again."
        );
      }

      return {routes};
    }
  );

/** Removes expired route estimates so unique customer addresses stay bounded. */
export const cleanupDeliveryRouteCache = onSchedule(
  {
    schedule: "every day 03:40",
    timeZone: "America/Chicago",
    region: "us-central1",
    retryCount: 1,
  },
  async () => {
    let deleted = 0;
    while (deleted < ROUTE_CACHE_CLEANUP_LIMIT) {
      const snapshot = await db.collection(ROUTE_CACHE_COLLECTION)
        .where("expiresAt", "<=", Timestamp.now())
        .limit(Math.min(450, ROUTE_CACHE_CLEANUP_LIMIT - deleted))
        .get();
      if (snapshot.empty) break;
      const batch = db.batch();
      snapshot.docs.forEach((document) => batch.delete(document.ref));
      await batch.commit();
      deleted += snapshot.size;
      if (snapshot.size < 450) break;
    }
    console.info("Delivery route cache cleanup completed.", {deleted});
  }
);

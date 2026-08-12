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

import {getFirestore} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {
  checkoutDistanceService,
  hasValidCheckoutCoordinates,
} from "../payment/checkout/checkoutDistanceService";
import {enforceCallableAbuseProtection} from "../security/callableAbuseProtection";

const db = getFirestore("default");

const googleMapsApiKey =
  defineSecret("GOOGLE_MAPS_API_KEY");

const MAX_STORE_IDS = 50;

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

      const routes = (
        await Promise.all(
          storeSnapshots.map(async (storeSnapshot) => {
            if (!storeSnapshot.exists) {
              return null;
            }

            const store = storeSnapshot.data();
            const latitude = store?.latitude;
            const longitude = store?.longitude;

            if (
              store?.isApproved !== true ||
              store?.isActive !== true ||
              typeof latitude !== "number" ||
              typeof longitude !== "number" ||
              !hasValidCheckoutCoordinates({
                latitude,
                longitude,
              })
            ) {
              return null;
            }

            try {
              const distanceMiles =
                await checkoutDistanceService
                  .getTrustedDrivingDistanceMiles(
                    {latitude, longitude},
                    destination,
                    googleMapsApiKey.value()
                  );

              return {
                storeId: storeSnapshot.id,
                distanceMiles,
              } satisfies DeliveryRouteResult;
            } catch (error) {
              console.error(
                "Google Routes could not calculate a store delivery route:",
                {
                  storeId: storeSnapshot.id,
                  error,
                }
              );

              return null;
            }
          })
        )
      ).filter(
        (route): route is DeliveryRouteResult =>
          route !== null
      );

      if (routes.length === 0) {
        throw new HttpsError(
          "unavailable",
          "Delivery routes could not be calculated. Please try again."
        );
      }

      return {routes};
    }
  );

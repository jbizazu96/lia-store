/*
|--------------------------------------------------------------------------
| Delivery Routes Client Service
|--------------------------------------------------------------------------
|
| The browser receives delivery distances only from the Firebase Function
| backed by Google Routes API. This keeps home, store, cart, and checkout
| on the same routing source as the payment calculation.
|
*/

import {
  getFunctions,
  httpsCallable,
} from "firebase/functions";
import {
  readCached,
  writeCached,
} from "@/services/cache/clientDataCache";

export interface DeliveryRouteCoordinates {
  latitude: number;
  longitude: number;
}

export interface StoreDeliveryRoute {
  storeId: string;
  distanceMiles: number;
}

/*
 * Store coordinates are only used to version a client cache entry. The
 * callable remains the source of truth for the actual store location and
 * driving distance, so the browser never submits a store coordinate to it.
 */
export interface DeliveryRouteStore {
  id: string;
  latitude: number;
  longitude: number;
}

interface GetStoreDeliveryRoutesResponse {
  routes: StoreDeliveryRoute[];
}

const functions = getFunctions(
  undefined,
  "us-central1"
);

const MAX_STORES_PER_REQUEST = 50;
const ROUTE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const inFlightRouteRequests = new Map<
  string,
  Promise<StoreDeliveryRoute[]>
>();

interface CachedRoute {
  distanceMiles: number | null;
}

function coordinateKey(value: number): string {
  return Number.isFinite(value) ? value.toFixed(6) : "invalid";
}

function routeCacheKey(
  store: DeliveryRouteStore,
  destination: DeliveryRouteCoordinates,
): string {
  return [
    "store-delivery-route",
    store.id,
    coordinateKey(store.latitude),
    coordinateKey(store.longitude),
    coordinateKey(destination.latitude),
    coordinateKey(destination.longitude),
  ].join(":");
}

function routeRequestKey(
  stores: DeliveryRouteStore[],
  destination: DeliveryRouteCoordinates,
): string {
  return [
    coordinateKey(destination.latitude),
    coordinateKey(destination.longitude),
    ...stores.map((store) => routeCacheKey(store, destination)).sort(),
  ].join("|");
}

export async function getStoreDeliveryRoutes(
  storeIds: string[],
  destination: DeliveryRouteCoordinates
): Promise<StoreDeliveryRoute[]> {
  const callable = httpsCallable<
    {
      storeIds: string[];
      destination: DeliveryRouteCoordinates;
    },
    GetStoreDeliveryRoutesResponse
  >(
    functions,
    "getStoreDeliveryRoutes"
  );

  const routeBatches: StoreDeliveryRoute[] = [];

  for (
    let start = 0;
    start < storeIds.length;
    start += MAX_STORES_PER_REQUEST
  ) {
    const response = await callable({
      storeIds: storeIds.slice(
        start,
        start + MAX_STORES_PER_REQUEST
      ),
      destination,
    });

    routeBatches.push(
      ...response.data.routes
    );
  }

  return routeBatches;
}

/**
 * Reuse a customer-address/store-location route until either endpoint changes.
 * This makes public catalog listener updates cheap: an edited name, image,
 * schedule, or product count does not cause a new Google Routes request.
 */
export async function getCachedStoreDeliveryRoutes(
  stores: DeliveryRouteStore[],
  destination: DeliveryRouteCoordinates,
): Promise<StoreDeliveryRoute[]> {
  const cachedRoutes: StoreDeliveryRoute[] = [];
  const missingStores: DeliveryRouteStore[] = [];

  for (const store of stores) {
    const cached = readCached<CachedRoute>(
      routeCacheKey(store, destination),
    );

    if (cached !== null) {
      if (cached.distanceMiles !== null) {
        cachedRoutes.push({
          storeId: store.id,
          distanceMiles: cached.distanceMiles,
        });
      }
      continue;
    }

    missingStores.push(store);
  }

  if (missingStores.length === 0) {
    return cachedRoutes;
  }

  const requestKey = routeRequestKey(missingStores, destination);
  let freshRoutesRequest = inFlightRouteRequests.get(requestKey);

  if (!freshRoutesRequest) {
    freshRoutesRequest = getStoreDeliveryRoutes(
      missingStores.map((store) => store.id),
      destination,
    ).finally(() => {
      inFlightRouteRequests.delete(requestKey);
    });
    inFlightRouteRequests.set(requestKey, freshRoutesRequest);
  }

  const freshRoutes = await freshRoutesRequest;
  const freshRouteByStoreId = new Map(
    freshRoutes.map((route) => [route.storeId, route.distanceMiles]),
  );

  missingStores.forEach((store) => {
    writeCached<CachedRoute>(
      routeCacheKey(store, destination),
      {
        distanceMiles: freshRouteByStoreId.get(store.id) ?? null,
      },
      { ttlMs: ROUTE_CACHE_TTL_MS },
    );
  });

  return [...cachedRoutes, ...freshRoutes];
}

export async function getStoreDeliveryRoute(
  storeId: string,
  destination: DeliveryRouteCoordinates
): Promise<StoreDeliveryRoute | null> {
  const routes = await getStoreDeliveryRoutes(
    [storeId],
    destination
  );

  return routes[0] ?? null;
}

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

export interface DeliveryRouteCoordinates {
  latitude: number;
  longitude: number;
}

export interface StoreDeliveryRoute {
  storeId: string;
  distanceMiles: number;
}

interface GetStoreDeliveryRoutesResponse {
  routes: StoreDeliveryRoute[];
}

const functions = getFunctions(
  undefined,
  "us-central1"
);

const MAX_STORES_PER_REQUEST = 50;

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

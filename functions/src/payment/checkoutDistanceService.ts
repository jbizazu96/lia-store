/*
|--------------------------------------------------------------------------
| Checkout Distance Service
|--------------------------------------------------------------------------
|
| Calculates trusted driving distance for payment preparation.
|
| This service runs only inside Firebase Functions.
|
| Why server-side?
|
| The browser's distance is useful for displaying an estimate, but it
| cannot be trusted when calculating the amount charged through Stripe.
|
| A modified browser request could otherwise submit:
|
| distanceMiles: 0
|
| and attempt to avoid the correct delivery fee.
|
| This service uses Google Routes API Compute Routes rather than the
| legacy Distance Matrix API used by the existing frontend proxy.
*/

const METERS_PER_MILE = 1609.344;

const GOOGLE_ROUTES_ENDPOINT =
  "https://routes.googleapis.com/directions/v2:computeRoutes";


/*
  Geographic coordinates used by the routing service.
*/
export interface CheckoutRouteCoordinates {
  latitude: number;
  longitude: number;
}


/*
  Minimal Google Routes API response required by LIA.
*/
interface GoogleRoutesResponse {
  routes?: Array<{
    distanceMeters?: number;

    /*
      Google returns duration strings such as:
      "734s"
    */
    duration?: string;
  }>;
}


/*
  Predictable routing failure codes.
*/
export type CheckoutDistanceErrorCode =
  | "INVALID_ROUTE_COORDINATES"
  | "MISSING_GOOGLE_MAPS_KEY"
  | "GOOGLE_ROUTE_REQUEST_FAILED"
  | "ROUTE_NOT_FOUND";


/*
  Expected distance-calculation error.
*/
export class CheckoutDistanceError extends Error {
  readonly code: CheckoutDistanceErrorCode;

  constructor(
    code: CheckoutDistanceErrorCode,
    message: string
  ) {
    super(message);

    this.name = "CheckoutDistanceError";
    this.code = code;
  }
}


/*
  Coordinates must represent a real geographic location.

  The explicit 0,0 rejection preserves the protection already used by
  the Next.js routing service. Missing coordinates were previously
  mapped to 0,0, which could make a failed route appear free.
*/
export function hasValidCheckoutCoordinates(
  coordinates: CheckoutRouteCoordinates
): boolean {
  const {
    latitude,
    longitude,
  } = coordinates;

  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(
      latitude === 0 &&
      longitude === 0
    )
  );
}


/*
  Calculate a trusted driving distance using Google Routes API.

  The Google API key is passed in by the callable Firebase Function.

  This keeps secret management at the function boundary and makes this
  service easier to test.
*/
async function getTrustedDrivingDistanceMiles(
  origin: CheckoutRouteCoordinates,
  destination: CheckoutRouteCoordinates,
  googleMapsApiKey: string
): Promise<number> {
  if (
    !hasValidCheckoutCoordinates(origin) ||
    !hasValidCheckoutCoordinates(destination)
  ) {
    throw new CheckoutDistanceError(
      "INVALID_ROUTE_COORDINATES",
      "The store or delivery address has invalid map coordinates."
    );
  }

  const normalizedApiKey =
    googleMapsApiKey.trim();

  if (!normalizedApiKey) {
    throw new CheckoutDistanceError(
      "MISSING_GOOGLE_MAPS_KEY",
      "The server routing service is not configured."
    );
  }

  let response: Response;

  try {
    response = await fetch(
      GOOGLE_ROUTES_ENDPOINT,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          /*
            Server-only Google Maps Platform key.
          */
          "X-Goog-Api-Key":
            normalizedApiKey,

          /*
            Request only the values required by LIA.

            Google Routes API uses field masks to control which response
            fields are returned.
          */
          "X-Goog-FieldMask":
            "routes.distanceMeters,routes.duration",
        },

        body: JSON.stringify({
          origin: {
            location: {
              latLng: {
                latitude:
                  origin.latitude,

                longitude:
                  origin.longitude,
              },
            },
          },

          destination: {
            location: {
              latLng: {
                latitude:
                  destination.latitude,

                longitude:
                  destination.longitude,
              },
            },
          },

          travelMode: "DRIVE",

          /*
            LIA currently needs a stable distance for delivery pricing.

            We can introduce traffic-aware ETA logic separately without
            allowing fluctuating traffic conditions to alter the
            distance-based customer fee.
          */
          routingPreference:
            "TRAFFIC_UNAWARE",

          /*
            Return one primary route.
          */
          computeAlternativeRoutes: false,

          units: "IMPERIAL",
        }),
      }
    );
  } catch (error: unknown) {
    console.error(
      "Google Routes request could not be completed:",
      error
    );

    throw new CheckoutDistanceError(
      "GOOGLE_ROUTE_REQUEST_FAILED",
      "The delivery route could not be calculated."
    );
  }

  if (!response.ok) {
    const responseText =
      await response.text()
        .catch(() => "");

    console.error(
      "Google Routes API rejected the checkout route:",
      {
        status: response.status,
        response:
          responseText.slice(0, 500),
      }
    );

    throw new CheckoutDistanceError(
      "GOOGLE_ROUTE_REQUEST_FAILED",
      "The delivery route could not be calculated."
    );
  }

  const data =
    await response.json() as
      GoogleRoutesResponse;

  const distanceMeters =
    data.routes?.[0]
      ?.distanceMeters;

  if (
    typeof distanceMeters !== "number" ||
    !Number.isFinite(distanceMeters) ||
    distanceMeters <= 0
  ) {
    throw new CheckoutDistanceError(
      "ROUTE_NOT_FOUND",
      "No valid driving route was found for this delivery address."
    );
  }

  const distanceMiles =
    distanceMeters /
    METERS_PER_MILE;

  if (
    !Number.isFinite(distanceMiles) ||
    distanceMiles <= 0
  ) {
    throw new CheckoutDistanceError(
      "ROUTE_NOT_FOUND",
      "The calculated delivery distance is invalid."
    );
  }

  return distanceMiles;
}


/*
  Type guard used by the future checkout callable function.
*/
export function isCheckoutDistanceError(
  error: unknown
): error is CheckoutDistanceError {
  return (
    error instanceof
    CheckoutDistanceError
  );
}


/*
  Stable service interface.
*/
export const checkoutDistanceService = {
  getTrustedDrivingDistanceMiles,
};
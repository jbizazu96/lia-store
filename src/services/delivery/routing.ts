export interface RouteCoordinates {
  latitude: number;
  longitude: number;
}

/**
 * Coordinates must be real geographic values before they are sent to Google.
 * The application previously mapped missing Firestore coordinates to 0, 0,
 * which made failed distance requests look like a zero-mile delivery.
 */
export function hasValidRouteCoordinates(
  coordinates: RouteCoordinates
): boolean {
  const { latitude, longitude } = coordinates;

  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

interface DistanceMatrixElement {
  status: string;
  distance?: {
    value: number;
  };
}

interface DistanceMatrixResponse {
  rows?: Array<{
    elements?: DistanceMatrixElement[];
  }>;
}

const MILES_PER_METER = 0.000621371;

/**
 * Returns the real driving distance supplied by Google Distance Matrix.
 * A null result means Google could not calculate a route for the locations.
 */
export async function getDrivingDistanceMiles(
  origin: RouteCoordinates,
  destination: RouteCoordinates
): Promise<number | null> {
  if (
    !hasValidRouteCoordinates(origin) ||
    !hasValidRouteCoordinates(destination)
  ) {
    console.error(
      "Distance calculation skipped because a customer or store address has invalid coordinates."
    );

    return null;
  }

  const origins = `${origin.latitude},${origin.longitude}`;
  const destinations = `${destination.latitude},${destination.longitude}`;
  const searchParams = new URLSearchParams({ origins, destinations });

  try {
    const response = await fetch(
      `/api/distance?${searchParams.toString()}`
    );

    if (!response.ok) {
      const error = await response.json().catch(() => null) as {
        error?: string;
      } | null;

      console.error(
        "Distance API request failed:",
        error?.error ?? response.statusText
      );

      return null;
    }

    const data = (await response.json()) as DistanceMatrixResponse;
    const element = data.rows?.[0]?.elements?.[0];

    if (element?.status !== "OK" || !element.distance) {
      console.error(
        "Google could not calculate a driving route:",
        element?.status ?? "missing route data"
      );

      return null;
    }

    return element.distance.value * MILES_PER_METER;
  } catch (error) {
    console.error("Distance API request could not be completed:", error);

    return null;
  }
}

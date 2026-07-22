export interface RouteCoordinates {
  latitude: number;
  longitude: number;
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
  const origins = `${origin.latitude},${origin.longitude}`;
  const destinations = `${destination.latitude},${destination.longitude}`;
  const searchParams = new URLSearchParams({ origins, destinations });

  const response = await fetch(`/api/distance?${searchParams.toString()}`);

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as DistanceMatrixResponse;
  const element = data.rows?.[0]?.elements?.[0];

  if (element?.status !== "OK" || !element.distance) {
    return null;
  }

  return element.distance.value * MILES_PER_METER;
}

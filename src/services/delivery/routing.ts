/*
|--------------------------------------------------------------------------
| Delivery Coordinate Validation
|--------------------------------------------------------------------------
|
| Google Routes requests are performed only through the Firebase Functions
| delivery route service. The browser keeps this small shared validator for
| address and store coordinate checks before making a callable request.
|
*/

export interface RouteCoordinates {
  latitude: number;
  longitude: number;
}

export function hasValidRouteCoordinates(
  coordinates: RouteCoordinates
): boolean {
  const {latitude, longitude} = coordinates;

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

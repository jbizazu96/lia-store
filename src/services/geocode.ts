/*
  Google Geocoding Service

  Converts a physical address into geographic coordinates.
  Used for:
  - Store locations
  - Customer delivery addresses
  - Distance calculations
*/

interface GeocodeResult {
  latitude: number;
  longitude: number;
  placeId: string;
  formattedAddress: string; // Make sure this is included
}

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  try {
    // Get Google Maps API key from environment
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      console.error("Missing Google Maps API Key");
      return null;
    }

    // Call Google Geocoding API
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
    );

    const data = await response.json();

    if (data.status !== "OK") {
      console.error("Geocoding API error:", data.status, data.error_message);
      return null;
    }

    const result = data.results[0];
    const location = result.geometry.location;

    return {
      latitude: location.lat,
      longitude: location.lng,
      placeId: result.place_id,
      formattedAddress: result.formatted_address, // This is now included
    };

  } catch (error) {
    console.error("Error geocoding address:", error);
    return null;
  }
}

/*
  Calculate distance between two coordinates using Haversine formula
  Returns distance in kilometers
*/
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/*
  Format distance for display
*/
export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(1)} km`;
}
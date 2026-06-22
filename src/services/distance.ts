/*
  Distance calculation service.
  Uses Haversine formula to calculate distance between two coordinates.
*/

interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in miles
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Format distance for display
 */
export function formatDistance(distance: number): string {
  if (distance < 1) {
    return `${Math.round(distance * 1000)} m`;
  }
  return `${distance.toFixed(1)} mi`;
}

/**
 * Check if store is within delivery radius
 */
export function isWithinDeliveryRadius(
  distance: number,
  maxRadius: number = 25
): boolean {
  return distance <= maxRadius;
}

/**
 * Get delivery status message
 */
export function getDeliveryStatusMessage(distance: number): {
  canDeliver: boolean;
  message: string;
  title: string;
} {
  const maxRadius = 25;
  
  if (distance <= maxRadius) {
    return {
      canDeliver: true,
      message: `We deliver to your area! Distance: ${formatDistance(distance)}`,
      title: "Available for Delivery",
    };
  }
  
  return {
    canDeliver: false,
    message: `This store is ${formatDistance(distance)} away, which is beyond our ${maxRadius}-mile delivery radius. Please try a store closer to you.`,
    title: "Store is Too Far",
  };
}
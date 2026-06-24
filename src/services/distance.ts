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
 * Shows miles with one decimal place, or meters if less than 0.1 mile
 */
export function formatDistance(distance: number): string {
  if (distance < 0.1) {
    // Less than 0.1 mile, show in meters
    const meters = Math.round(distance * 1609.34);
    return `${meters} m`;
  }
  return `${distance.toFixed(1)} mi`;
}

/**
 * Get delivery fee based on distance
 * Updated fee structure
 */
export function getDeliveryFee(distance: number): string {
  if (distance < 3) return "$5.99";
  if (distance < 5) return "$6.99";
  if (distance < 8) return "$8.99";
  if (distance < 12) return "$10.99";
  if (distance < 25) return "$15.99";
  return "Unavailable";
}

/**
 * Get delivery fee as a number (for calculations)
 */
export function getDeliveryFeeNumber(distance: number): number {
  if (distance < 3) return 5.99;
  if (distance < 5) return 6.99;
  if (distance < 8) return 8.99;
  if (distance < 12) return 10.99;
  if (distance < 25) return 15.99;
  return 0;
}

/**
 * Get estimated delivery time based on distance
 * 2 min per mile + 5 min prep time
 */
export function getEstimatedTime(distance: number): string {
  if (!distance || distance === 0) return "5 min";
  const totalMinutes = Math.round(distance * 2 + 5);
  
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

/**
 * Get estimated time as a number (for calculations)
 */
export function getEstimatedTimeNumber(distance: number): number {
  if (!distance || distance === 0) return 5;
  return Math.round(distance * 2 + 5);
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
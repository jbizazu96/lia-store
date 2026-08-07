
/*
|--------------------------------------------------------------------------
| Distance Service
|--------------------------------------------------------------------------
|
| Responsible for:
|
| • Coordinate calculations
| • Distance formatting
| • ETA calculations
| • Delivery radius checks
| • Delivery availability messages
|
| Does NOT:
|
| • Calculate delivery pricing
| • Calculate commissions
| • Calculate service fees
|
*/

import { DELIVERY_CONFIG } from "@/config/delivery";
import type {OrderDeliveryPolicy} from "@/services/delivery/orderDeliveryPolicyClientService";

export interface Coordinates {
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
  const R = DELIVERY_CONFIG.EARTH_RADIUS_MILES;
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
    const meters = Math.round(
  distance * DELIVERY_CONFIG.METERS_PER_MILE
);
    return `${meters} m`;
  }
  return `${distance.toFixed(1)} mi`;
}

/**
 * Get delivery fee based on distance
 * Updated fee structure
 */

/**
 * Get estimated delivery time based on distance
 * 2 min per mile + 5 min prep time
 */
export function getEstimatedTime(distance: number, policy?: OrderDeliveryPolicy | null): string {
  const preparationMinutes = policy?.defaultPreparationMinutes ?? DELIVERY_CONFIG.DEFAULT_PREP_MINUTES;
  const minutesPerMile = policy?.minutesPerMile ?? DELIVERY_CONFIG.MINUTES_PER_MILE;
  if (!distance || distance === 0) {
  return `${preparationMinutes} min`;
}
  const totalMinutes = Math.round(
  distance * minutesPerMile + preparationMinutes
);
  
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
export function getEstimatedTimeNumber(distance: number, policy?: OrderDeliveryPolicy | null): number {
  const preparationMinutes = policy?.defaultPreparationMinutes ?? DELIVERY_CONFIG.DEFAULT_PREP_MINUTES;
  const minutesPerMile = policy?.minutesPerMile ?? DELIVERY_CONFIG.MINUTES_PER_MILE;
  if (!distance || distance === 0) return preparationMinutes;
  return Math.round(
  distance * minutesPerMile + preparationMinutes
);
}

/**
 * Check if store is within delivery radius
 */
export function isWithinDeliveryRadius(
  distance: number,
  maxRadius: number,
): boolean {
  return distance <= maxRadius;
}

/**
 * Get delivery status message
 */
export function getDeliveryStatusMessage(
  distance: number,
  maxRadius: number,
): {
  canDeliver: boolean;
  message: string;
  title: string;
} {
  const canDeliver = isWithinDeliveryRadius(
    distance,
    maxRadius
  );

  if (canDeliver) {
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

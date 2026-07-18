
/*
|--------------------------------------------------------------------------
| Delivery Pricing Service
|--------------------------------------------------------------------------
|
| Responsible for:
|
| • Delivery fee calculation
| • Service fee calculation
| • Store commission calculation
| • Free delivery logic
|
| Does NOT:
|
| • Calculate distance
| • Format distance
| • Geocode addresses
| • Calculate ETA
|
*/

import { DELIVERY_CONFIG } from "@/config/delivery";
import { PRICING_CONFIG } from "@/config/pricing";


function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface DeliveryPricingConfig {
  baseFee: number;          // Base fee for first 5 miles (e.g., $4.99)
  perMileRate: number;      // $0.75 per mile after base
  maxDistance: number;      // 20 miles maximum
  commissionRate: number;   // 0.10 - 0.15 (10-15%)
  freeDeliveryThreshold: number; // Free delivery over this amount (e.g., $30)
}

export interface DeliveryPricingResult {
  deliveryFee: number;
  serviceFee: number;
  commission: number;
  totalFees: number;
  isFreeDelivery: boolean;
  breakdown: {
    baseFee: number;
    distanceFee: number;
    serviceFee: number;
    peakSurcharge: number;
    commission: number;
  };
}

// Default configuration (can be overridden from admin panel)
const DEFAULT_CONFIG: DeliveryPricingConfig = {
  baseFee: DELIVERY_CONFIG.BASE_DELIVERY_FEE,
  perMileRate: DELIVERY_CONFIG.COST_PER_MILE,
  maxDistance: DELIVERY_CONFIG.MAX_RADIUS_MILES,
  commissionRate: PRICING_CONFIG.DEFAULT_COMMISSION_RATE,
  freeDeliveryThreshold: PRICING_CONFIG.FREE_DELIVERY_MINIMUM,
};

// Admin config (fetched from Firestore in production)
let adminConfig: DeliveryPricingConfig = Object.freeze({
  ...DEFAULT_CONFIG,
});

export function setDeliveryConfig(config: Partial<DeliveryPricingConfig>) {
  adminConfig = Object.freeze({
  ...adminConfig,
  ...config,
});
}

export function getDeliveryConfig(): DeliveryPricingConfig {
  return adminConfig;
}

export function calculateDeliveryFee(
  distanceMiles: number,
  subtotal: number,
  isPeakTime: boolean = false,
): DeliveryPricingResult {
  const config = adminConfig;

  // 1. Calculate distance-based fee
  let distanceFee = 0;
  
 if (distanceMiles <= DELIVERY_CONFIG.BASE_DISTANCE_MILES) {
    // Base fee for up to 5 miles
    distanceFee = config.baseFee;
  } else if (distanceMiles <= config.maxDistance) {
    // Base fee + $0.75 per mile over 5
    const extraMiles = distanceMiles - DELIVERY_CONFIG.BASE_DISTANCE_MILES;
    distanceFee = config.baseFee + (extraMiles * config.perMileRate);
  } else {
    // Maximum distance reached
    distanceFee =
  config.baseFee +
  ((config.maxDistance - DELIVERY_CONFIG.BASE_DISTANCE_MILES) *
    config.perMileRate);
  }

  // Round to 2 decimal places
 distanceFee = roundMoney(distanceFee);

  // 2. Check if delivery is free (orders over threshold)
  const isFreeDelivery = subtotal >= config.freeDeliveryThreshold;

  // 3. Calculate service fee (10% of subtotal)
let serviceFee =
  subtotal * PRICING_CONFIG.SERVICE_FEE_PERCENTAGE;

serviceFee = Math.max(
  PRICING_CONFIG.MIN_SERVICE_FEE,
  Math.min(
    serviceFee,
    PRICING_CONFIG.MAX_SERVICE_FEE
  )
);

  // 4. Peak time surcharge (if enabled)
  let peakSurcharge = 0;
  if (isPeakTime) {
    peakSurcharge = DELIVERY_CONFIG.PEAK_SURCHARGE;
  }

  // 5. Calculate commission (for store owner)
const commission = roundMoney(
  subtotal * config.commissionRate
);

  // 6. Calculate final delivery fee
let deliveryFee = isFreeDelivery ? 0 : distanceFee + peakSurcharge;

deliveryFee = roundMoney(deliveryFee);
  
  // Add service fee even if delivery is free
  const totalFees = roundMoney(
  deliveryFee + serviceFee
);

  return {
    deliveryFee,
    serviceFee,
    commission,
    totalFees,
    isFreeDelivery,
    breakdown: {
      baseFee: roundMoney(config.baseFee),
      distanceFee,
      serviceFee,
      peakSurcharge,
      commission,
    },
  };
}

// Helper to format distance-based fee for display
export function getDeliveryFeeDisplay(distanceMiles: number): string {
  const { deliveryFee } = calculateDeliveryFee(distanceMiles, 0);

  return deliveryFee === 0
    ? "Free"
    : `$${deliveryFee.toFixed(2)}`;
}

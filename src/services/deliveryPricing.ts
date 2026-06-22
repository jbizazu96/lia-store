/*
  Simple Delivery Pricing for LIA

  Based on:
  - Base fee for first 5 miles
  - $0.75 per additional mile up to 20 miles
  - Commission: 10-15% (configurable in admin panel)
*/

interface DeliveryPricingConfig {
  baseFee: number;          // Base fee for first 5 miles (e.g., $4.99)
  perMileRate: number;      // $0.75 per mile after base
  maxDistance: number;      // 20 miles maximum
  commissionRate: number;   // 0.10 - 0.15 (10-15%)
  freeDeliveryThreshold: number; // Free delivery over this amount (e.g., $30)
}

interface DeliveryPricingResult {
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
  baseFee: 4.99,
  perMileRate: 0.75,
  maxDistance: 20,
  commissionRate: 0.12, // 12% default
  freeDeliveryThreshold: 30,
};

// Admin config (fetched from Firestore in production)
let adminConfig: DeliveryPricingConfig = { ...DEFAULT_CONFIG };

export function setDeliveryConfig(config: Partial<DeliveryPricingConfig>) {
  adminConfig = { ...adminConfig, ...config };
}

export function getDeliveryConfig(): DeliveryPricingConfig {
  return adminConfig;
}

export function calculateDeliveryFee(
  distanceMiles: number,
  subtotal: number,
  isPeakTime: boolean = false,
  driverAvailability: number = 0.5
): DeliveryPricingResult {
  const config = adminConfig;

  // 1. Calculate distance-based fee
  let distanceFee = 0;
  
  if (distanceMiles <= 5) {
    // Base fee for up to 5 miles
    distanceFee = config.baseFee;
  } else if (distanceMiles <= config.maxDistance) {
    // Base fee + $0.75 per mile over 5
    const extraMiles = distanceMiles - 5;
    distanceFee = config.baseFee + (extraMiles * config.perMileRate);
  } else {
    // Maximum distance reached
    distanceFee = config.baseFee + ((config.maxDistance - 5) * config.perMileRate);
  }

  // Round to 2 decimal places
  distanceFee = Math.round(distanceFee * 100) / 100;

  // 2. Check if delivery is free (orders over threshold)
  const isFreeDelivery = subtotal >= config.freeDeliveryThreshold;

  // 3. Calculate service fee (10% of subtotal)
  let serviceFee = subtotal * 0.10;
  serviceFee = Math.max(0.99, Math.min(serviceFee, 5.99)); // Min $0.99, Max $5.99
  serviceFee = Math.round(serviceFee * 100) / 100;

  // 4. Peak time surcharge (if enabled)
  let peakSurcharge = 0;
  if (isPeakTime) {
    peakSurcharge = 1.99;
  }

  // 5. Calculate commission (for store owner)
  const commission = Math.round(subtotal * config.commissionRate * 100) / 100;

  // 6. Calculate final delivery fee
  let deliveryFee = isFreeDelivery ? 0 : distanceFee + peakSurcharge;
  
  // Add service fee even if delivery is free
  const totalFees = deliveryFee + serviceFee;

  return {
    deliveryFee: Math.round(deliveryFee * 100) / 100,
    serviceFee: serviceFee,
    commission: commission,
    totalFees: Math.round(totalFees * 100) / 100,
    isFreeDelivery,
    breakdown: {
      baseFee: config.baseFee,
      distanceFee: Math.round(distanceFee * 100) / 100,
      serviceFee: serviceFee,
      peakSurcharge: peakSurcharge,
      commission: commission,
    },
  };
}

// Helper to format distance-based fee for display
export function getDeliveryFeeDisplay(distanceMiles: number): string {
  const config = adminConfig;
  
  let fee = 0;
  
  if (distanceMiles <= 5) {
    fee = config.baseFee;
  } else if (distanceMiles <= config.maxDistance) {
    const extraMiles = distanceMiles - 5;
    fee = config.baseFee + (extraMiles * config.perMileRate);
  } else {
    fee = config.baseFee + ((config.maxDistance - 5) * config.perMileRate);
  }

  // ✅ Round to 2 decimal places and format
  const roundedFee = Math.round(fee * 100) / 100;
  return `$${roundedFee.toFixed(2)}`;
}

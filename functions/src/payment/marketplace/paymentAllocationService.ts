/**
 * ================================================================
 * Payment Allocation Service
 * ================================================================
 *
 * This service is responsible for determining how every customer
 * payment is divided across the marketplace.
 *
 * IMPORTANT
 * ---------
 * This service:
 *
 * ✅ Knows business rules
 * ✅ Calculates allocations
 *
 * This service NEVER:
 *
 * ❌ Calls Stripe
 * ❌ Writes to Firestore
 * ❌ Creates Transfers
 * ❌ Sends Notifications
 *
 * It should always behave like a pure mathematical function.
 */

import {
    BASIS_POINTS,
    STORE_COMMISSION_BASIS_POINTS,
    DRIVER_COMMISSION_BASIS_POINTS,
} from "./marketplaceConfiguration";
import {
} from "./marketplaceConfiguration";
import {
    PAYMENT_PRICING_CONFIG,
} from "../pricing/paymentPricingConfig";

/**
 * Input required to calculate marketplace allocations.
 *
 * All monetary values are stored in the smallest currency unit
 * (USD cents).
 */
export interface PaymentAllocationInput {

    /**
     * Product subtotal before taxes.
     */
    merchandiseSubtotal: number;

    /**
     * Sales tax collected for the store.
     */
    salesTax: number;

    /**
     * Delivery fee paid by the customer.
     */
    deliveryFee: number;

    /**
     * Driver tip.
     */
    driverTip: number;

    /**
     * Platform service fee.
     */
    serviceFee: number;
}

/**
 * Store allocation.
 */
export interface StoreAllocation {

    grossMerchandise: number;

    commissionAmount: number;

    netMerchandise: number;

    salesTax: number;

    transferAmount: number;
}

/**
 * Driver allocation.
 */
export interface DriverAllocation {

    grossDeliveryFee: number;

    commissionAmount: number;

    netDeliveryFee: number;

    driverTip: number;

    freeDeliveryIncentive: number;

    transferAmount: number;
}

/**
 * Platform allocation.
 */
export interface PlatformAllocation {

    storeCommission: number;

    driverCommission: number;

    serviceFee: number;

    totalRevenue: number;

    freeDeliveryIncentiveCost: number;
}

/**
 * Final marketplace allocation.
 */
export interface PaymentAllocation {

    store: StoreAllocation;

    driver: DriverAllocation;

    platform: PlatformAllocation;
}

/**
 * Calculate marketplace payment allocation.
 *
 * NOTE:
 * This is intentionally a placeholder implementation.
 * The complete calculation logic will be added in the
 * next lesson.
 */
export function calculatePaymentAllocation(
    input: PaymentAllocationInput
): PaymentAllocation {

    const storeCommission = Math.round(
        input.merchandiseSubtotal *
        STORE_COMMISSION_BASIS_POINTS /
        BASIS_POINTS
    );

    const driverCommission = Math.round(
        input.deliveryFee *
        DRIVER_COMMISSION_BASIS_POINTS /
        BASIS_POINTS
    );

    const freeDeliveryIncentive =
        input.deliveryFee === 0 &&
        input.merchandiseSubtotal >=
            PAYMENT_PRICING_CONFIG.freeDeliveryMinimumCents
            ? input.driverTip > 0
                ? PAYMENT_PRICING_CONFIG.freeDeliveryDriverIncentiveWithTipCents
                : PAYMENT_PRICING_CONFIG.freeDeliveryDriverIncentiveWithoutTipCents
            : 0;

    return {

        store: {

            grossMerchandise: input.merchandiseSubtotal,

            commissionAmount: storeCommission,

            netMerchandise:
                input.merchandiseSubtotal - storeCommission,

            salesTax: input.salesTax,

            transferAmount:
                (input.merchandiseSubtotal - storeCommission)
                + input.salesTax,
        },

        driver: {

            grossDeliveryFee: input.deliveryFee,

            commissionAmount: driverCommission,

            netDeliveryFee:
                input.deliveryFee - driverCommission,

            driverTip: input.driverTip,

            freeDeliveryIncentive,

            transferAmount:
                (input.deliveryFee - driverCommission)
                + input.driverTip
                + freeDeliveryIncentive,
        },

        platform: {

            storeCommission,

            driverCommission,

            serviceFee: input.serviceFee,

            totalRevenue:
                storeCommission
                + driverCommission
                + input.serviceFee
                - freeDeliveryIncentive,

            freeDeliveryIncentiveCost:
                freeDeliveryIncentive,
        },
    };
}

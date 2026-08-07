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
} from "./marketplaceConfiguration";

/**
 * Input required to calculate marketplace allocations.
 *
 * All monetary values are stored in the smallest currency unit
 * (USD cents).
 */
export interface PaymentAllocationInput {
    /*
     * Trusted Admin-configured store commission captured for this settlement.
     * When absent, the marketplace policy default applies.
     */
    storeCommissionBasisPoints: number;
    driverCommissionBasisPoints: number;
    freeDeliveryMinimumCents: number;
    freeDeliveryDriverIncentiveWithoutTipCents: number;
    freeDeliveryDriverIncentiveWithTipCents: number;

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
        input.storeCommissionBasisPoints /
        BASIS_POINTS
    );

    const driverCommission = Math.round(
        input.deliveryFee *
        input.driverCommissionBasisPoints /
        BASIS_POINTS
    );

    const freeDeliveryIncentive =
        input.deliveryFee === 0 &&
        input.merchandiseSubtotal >=
            input.freeDeliveryMinimumCents
            ? input.driverTip > 0
                ? input.freeDeliveryDriverIncentiveWithTipCents
                : input.freeDeliveryDriverIncentiveWithoutTipCents
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

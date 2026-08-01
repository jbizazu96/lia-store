/**
 * ================================================================
 * Payment Settlement Types
 * ================================================================
 *
 * A settlement represents money that has become eligible
 * to be transferred after an order has been delivered.
 *
 * Settlements exist before Stripe transfers.
 */

/**
 * Settlement status.
 */
export type PaymentSettlementStatus =
    | "pending"
    | "eligible"
    | "processing"
    | "completed"
    | "failed";

/**
 * One settlement record.
 */
export interface PaymentSettlement {

    /**
     * Firestore id.
     */
    id: string;

    /**
     * Order being settled.
     */
    orderId: string;

    /**
     * Store owner.
     */
    storeId: string;

    /**
     * Driver.
     */
    driverId: string;

    /**
     * Store transfer amount.
     */
    storeAmount: number;

    /**
     * Driver transfer amount.
     */
    driverAmount: number;

    /**
     * Currency.
     */
    currency: string;

    /**
     * Settlement status.
     */
    status: PaymentSettlementStatus;

    /**
     * Created timestamp.
     */
    createdAt: string;

    /**
     * Completed timestamp.
     */
    completedAt?: string;
}
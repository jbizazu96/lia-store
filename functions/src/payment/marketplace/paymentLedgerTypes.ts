/**
 * ================================================================
 * Payment Ledger Types
 * ================================================================
 *
 * The payment ledger is an immutable record of every financial
 * event that occurs during an order's lifecycle.
 *
 * Ledger entries are NEVER edited.
 * If something changes (refund, retry, reversal),
 * a NEW ledger entry is created.
 */

/**
 * Types of financial events.
 */
export type PaymentLedgerEventType =
    | "payment_received"
    | "allocation_created"
    | "settlement_created"
    | "settlement_completed"
    | "store_transfer_created"
    | "store_transfer_completed"
    | "driver_transfer_created"
    | "driver_transfer_completed"
    | "refund_created"
    | "refund_completed"
    | "transfer_failed"
    | "transfer_retry";

/**
 * One immutable financial event.
 */
export interface PaymentLedgerEntry {

    /**
     * Firestore document id.
     */
    id: string;

    /**
     * Order associated with the event.
     */
    orderId: string;

    /**
     * Type of financial event.
     */
    event: PaymentLedgerEventType;

    /**
     * Human-readable description.
     */
    description: string;

    /**
     * Amount involved (smallest currency unit).
     */
    amount: number;

    /**
     * Currency.
     */
    currency: string;

    /**
     * Timestamp (ISO string).
     */
    createdAt: string;

    /**
     * Optional metadata.
     *
     * Stripe IDs
     * Transfer IDs
     * Refund IDs
     * Error messages
     */
    metadata?: Record<string, unknown>;
}
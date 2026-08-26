/*
|--------------------------------------------------------------------------
| Marketplace Settlement Activation Service
|--------------------------------------------------------------------------
|
| Activates marketplace settlement after a paid order is successfully
| completed.
|
| This is the financial bridge between order fulfillment and payout
| processing.
|
| Responsibilities:
|
| - Load the trusted completed order
| - Verify payment and fulfillment state
| - Load and validate the store payout account
| - Load and validate the assigned driver payout account
| - Calculate the immutable marketplace allocation
| - Verify every customer-paid cent is accounted for
| - Create one idempotent settlement
| - Create financial ledger entries
| - Prepare one store transfer and one driver transfer
|
| This service does NOT call Stripe.
|
| Stripe transfer execution remains under:
|
| src/payment/stripe/
|
| Marketplace decides.
| Stripe executes.
|
*/

import {
  getFirestore,
  type DocumentData,
} from "firebase-admin/firestore";

import {
  calculatePaymentAllocation,
  type PaymentAllocation,
} from "./paymentAllocationService";
import {
  parseMarketplacePricingPolicy,
} from "../pricing/marketplacePricingPolicy";

import {
  createLedgerEntry,
} from "./paymentLedgerService";

import {
  createSettlement,
} from "./paymentSettlementService";

import {
  paymentSettlementProcessor,
} from "./paymentSettlementProcessor";

/*
|--------------------------------------------------------------------------
| Firestore
|--------------------------------------------------------------------------
*/

const db =
  getFirestore("default");

/*
|--------------------------------------------------------------------------
| Input
|--------------------------------------------------------------------------
*/

export interface ActivateMarketplaceSettlementInput {
  orderId: string;
}

/*
|--------------------------------------------------------------------------
| Result
|--------------------------------------------------------------------------
*/

export interface ActivateMarketplaceSettlementResult {
  orderId: string;

  settlementId: string;

  settlementCreated: boolean;

  storeTransferId: string;

  storeTransferCreated: boolean;

  driverTransferId: string | null;

  driverTransferCreated: boolean;

  allocation:
    PaymentAllocation;
}

/*
|--------------------------------------------------------------------------
| Error
|--------------------------------------------------------------------------
*/

export type MarketplaceSettlementActivationErrorCode =
  | "INVALID_ARGUMENT"
  | "ORDER_NOT_FOUND"
  | "INVALID_ORDER"
  | "ORDER_NOT_COMPLETED"
  | "ORDER_NOT_PAID"
  | "INVALID_PRICING"
  | "PAYMENT_TOTAL_MISMATCH"
  | "INVALID_PAYMENT_SOURCE"
  | "STORE_NOT_FOUND"
  | "STORE_PAYOUT_NOT_READY"
  | "STORE_ACCOUNT_MISMATCH"
  | "DRIVER_NOT_ASSIGNED"
  | "DRIVER_NOT_FOUND"
  | "DRIVER_NOT_APPROVED"
  | "DRIVER_PAYOUT_NOT_READY"
  | "SETTLEMENT_ACTIVATION_FAILED";

export class MarketplaceSettlementActivationError extends Error {
  readonly code:
    MarketplaceSettlementActivationErrorCode;

  readonly causeMessage:
    string | null;

  constructor(
    code:
      MarketplaceSettlementActivationErrorCode,
    message: string,
    causeMessage?: string
  ) {
    super(message);

    this.name =
      "MarketplaceSettlementActivationError";

    this.code =
      code;

    this.causeMessage =
      causeMessage ?? null;
  }
}

/*
|--------------------------------------------------------------------------
| Internal Types
|--------------------------------------------------------------------------
*/

interface TrustedMarketplacePricing {
  subtotalAmount: number;

  deliveryFeeAmount: number;

  serviceFeeAmount: number;

  taxAmount: number;

  tipAmount: number;

  totalAmount: number;
}

interface TrustedPaymentSource {
  paymentIntentId: string;

  stripeChargeId: string;

  transferGroup: string;
}

interface TrustedStorePayout {
  storeId: string;

  stripeAccountId: string;
  storeCommissionBasisPoints: number;
}

interface TrustedDriverPayout {
  driverId: string;

  stripeAccountId: string;
}

async function getConfiguredDriverCommissionBasisPoints(): Promise<number> {
  const value = (await db.collection("settings").doc("marketplacePayment").get())
    .data()?.defaultDriverCommissionBasisPoints;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 5_000
    ? value
    : 3_000;
}

/*
|--------------------------------------------------------------------------
| Validation Helpers
|--------------------------------------------------------------------------
*/

function requireIdentifier(
  value: unknown,
  fieldName: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new MarketplaceSettlementActivationError(
      "INVALID_ARGUMENT",
      `${fieldName} is required.`
    );
  }

  const normalized =
    value.trim();

  if (
    normalized.includes("/") ||
    normalized.includes("\\")
  ) {
    throw new MarketplaceSettlementActivationError(
      "INVALID_ARGUMENT",
      `${fieldName} contains invalid characters.`
    );
  }

  return normalized;
}

function requireString(
  value: unknown,
  code:
    MarketplaceSettlementActivationErrorCode,
  message: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new MarketplaceSettlementActivationError(
      code,
      message
    );
  }

  return value.trim();
}

function requireNonNegativeCentAmount(
  value: unknown,
  fieldName: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new MarketplaceSettlementActivationError(
      "INVALID_PRICING",
      `${fieldName} must be a non-negative integer amount.`
    );
  }

  return value;
}

function requirePositiveCentAmount(
  value: unknown,
  fieldName: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new MarketplaceSettlementActivationError(
      "INVALID_PRICING",
      `${fieldName} must be a positive integer amount.`
    );
  }

  return value;
}

function getSafeErrorMessage(
  error: unknown
): string {
  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message.trim();
  }

  return "Unknown marketplace settlement activation failure.";
}

/*
|--------------------------------------------------------------------------
| Order Validation
|--------------------------------------------------------------------------
*/

function validateOrderState(
  order:
    DocumentData
): void {
  /*
   * The current LIA order domain uses "completed" as the successful
   * terminal fulfillment state.
   */
  if (
    order.status !==
    "completed"
  ) {
    throw new MarketplaceSettlementActivationError(
      "ORDER_NOT_COMPLETED",
      "The order is not completed and cannot be settled."
    );
  }

  if (order.fulfillmentType === "pickup") {
    if (!order.pickup?.pickedUpAt || typeof order.pickup?.handedOffBy !== "string") {
      throw new MarketplaceSettlementActivationError(
        "ORDER_NOT_COMPLETED",
        "Customer pickup has not been securely confirmed.",
      );
    }
  } else if (order.shipday?.status !== "delivered") {
    throw new MarketplaceSettlementActivationError(
      "ORDER_NOT_COMPLETED",
      "Shipday has not confirmed successful delivery."
    );
  }

  if (
    order.checkoutStatus !==
    "confirmed"
  ) {
    throw new MarketplaceSettlementActivationError(
      "ORDER_NOT_PAID",
      "The order checkout has not been confirmed."
    );
  }

  if (
    order.payment?.status !==
    "paid"
  ) {
    throw new MarketplaceSettlementActivationError(
      "ORDER_NOT_PAID",
      "The order payment has not been confirmed."
    );
  }

  if (
    order.payment?.currency !==
    "usd"
  ) {
    throw new MarketplaceSettlementActivationError(
      "INVALID_PAYMENT_SOURCE",
      "The order payment currency is invalid."
    );
  }

  if (
    order.payment?.architecture !==
    "separate_charges_and_transfers"
  ) {
    throw new MarketplaceSettlementActivationError(
      "INVALID_PAYMENT_SOURCE",
      "The order uses an unsupported payment architecture."
    );
  }

  if (
    order.payment?.version !==
    "v1"
  ) {
    throw new MarketplaceSettlementActivationError(
      "INVALID_PAYMENT_SOURCE",
      "The order uses an unsupported marketplace payment version."
    );
  }
}

/*
|--------------------------------------------------------------------------
| Pricing
|--------------------------------------------------------------------------
*/

function getTrustedPricing(
  order:
    DocumentData
): TrustedMarketplacePricing {
  const pricing =
    order.pricing;

  const trustedPricing:
    TrustedMarketplacePricing = {
      subtotalAmount:
        requirePositiveCentAmount(
          pricing?.subtotalAmount,
          "Merchandise subtotal"
        ),

      deliveryFeeAmount:
        requireNonNegativeCentAmount(
          pricing?.deliveryFeeAmount,
          "Delivery fee"
        ),

      serviceFeeAmount:
        requireNonNegativeCentAmount(
          pricing?.serviceFeeAmount,
          "Service fee"
        ),

      taxAmount:
        requireNonNegativeCentAmount(
          pricing?.taxAmount,
          "Sales tax"
        ),

      tipAmount:
        requireNonNegativeCentAmount(
          pricing?.tipAmount,
          "Driver tip"
        ),

      totalAmount:
        requirePositiveCentAmount(
          pricing?.totalAmount,
          "Order total"
        ),
    };

  const calculatedCustomerTotal =
    trustedPricing.subtotalAmount +
    trustedPricing.deliveryFeeAmount +
    trustedPricing.serviceFeeAmount +
    trustedPricing.taxAmount +
    trustedPricing.tipAmount;

  if (
    calculatedCustomerTotal !==
    trustedPricing.totalAmount
  ) {
    throw new MarketplaceSettlementActivationError(
      "PAYMENT_TOTAL_MISMATCH",
      "The trusted order pricing does not add up to the customer total."
    );
  }

  const amountReceived =
    requirePositiveCentAmount(
      order.payment?.amountReceived,
      "Stripe amount received"
    );

  if (
    amountReceived !==
    trustedPricing.totalAmount
  ) {
    throw new MarketplaceSettlementActivationError(
      "PAYMENT_TOTAL_MISMATCH",
      "The Stripe amount received does not match the trusted order total."
    );
  }

  return trustedPricing;
}

/*
|--------------------------------------------------------------------------
| Payment Source
|--------------------------------------------------------------------------
*/

function getTrustedPaymentSource(
  order:
    DocumentData
): TrustedPaymentSource {
  const paymentIntentId =
    requireString(
      order.payment?.paymentIntentId,
      "INVALID_PAYMENT_SOURCE",
      "The order is missing its Stripe PaymentIntent ID."
    );

  if (
    !paymentIntentId.startsWith(
      "pi_"
    )
  ) {
    throw new MarketplaceSettlementActivationError(
      "INVALID_PAYMENT_SOURCE",
      "The order Stripe PaymentIntent ID is invalid."
    );
  }

  const stripeChargeId =
    requireString(
      order.payment?.stripeChargeId,
      "INVALID_PAYMENT_SOURCE",
      "The order is missing its Stripe Charge ID."
    );

  if (
    !stripeChargeId.startsWith(
      "ch_"
    )
  ) {
    throw new MarketplaceSettlementActivationError(
      "INVALID_PAYMENT_SOURCE",
      "The order Stripe Charge ID is invalid."
    );
  }

  const transferGroup =
    requireString(
      order.payment?.transferGroup,
      "INVALID_PAYMENT_SOURCE",
      "The order is missing its transfer group."
    );

  return {
    paymentIntentId,

    stripeChargeId,

    transferGroup,
  };
}

/*
|--------------------------------------------------------------------------
| Store Payout
|--------------------------------------------------------------------------
*/

async function getTrustedStorePayout(
  order:
    DocumentData
): Promise<
  TrustedStorePayout
> {
  const storeId =
    requireString(
      order.store?.id,
      "INVALID_ORDER",
      "The order store is invalid."
    );

  const orderStripeAccountId =
    requireString(
      order.payout
        ?.storeStripeAccountId,
      "STORE_PAYOUT_NOT_READY",
      "The order is missing the store payout account."
    );

  if (
    !orderStripeAccountId.startsWith(
      "acct_"
    )
  ) {
    throw new MarketplaceSettlementActivationError(
      "STORE_PAYOUT_NOT_READY",
      "The order store payout account is invalid."
    );
  }

  const storeDocument =
    await db
      .collection("stores")
      .doc(storeId)
      .get();

  if (
    !storeDocument.exists
  ) {
    throw new MarketplaceSettlementActivationError(
      "STORE_NOT_FOUND",
      "The store account was not found."
    );
  }

  const marketplaceSettings =
    await db
      .collection("settings")
      .doc("marketplacePayment")
      .get();
  const configuredDefault =
    marketplaceSettings.data()?.defaultStoreCommissionBasisPoints;
  const storeOverride =
    storeDocument.data()?.paymentSettings?.storeCommissionBasisPoints;

  /*
   * The paid order snapshots its intended connected account. A later account
   * change must not redirect or block an amount already earned. Stripe will
   * still reject an unavailable account during transfer execution, where the
   * obligation remains retryable and auditable.
   */

  return {
    storeId,

    stripeAccountId:
      orderStripeAccountId,
    storeCommissionBasisPoints:
      typeof storeOverride === "number" &&
      Number.isInteger(storeOverride) &&
      storeOverride >= 0 &&
      storeOverride <= 5_000
        ? storeOverride
        : typeof configuredDefault === "number" &&
          Number.isInteger(configuredDefault) &&
          configuredDefault >= 0 &&
          configuredDefault <= 5_000
          ? configuredDefault
          : 1_000,
  };
}

/*
|--------------------------------------------------------------------------
| Driver Payout
|--------------------------------------------------------------------------
*/

async function getTrustedDriverPayout(
  order:
    DocumentData
): Promise<
  TrustedDriverPayout
> {
  const driverId =
    requireString(
      order.delivery?.driverId,
      "DRIVER_NOT_ASSIGNED",
      "The completed order has no assigned LIA driver."
    );

  const shipdayCarrierId =
    order.delivery
      ?.shipdayCarrierId;

  if (
    typeof shipdayCarrierId !==
      "number" ||
    !Number.isSafeInteger(
      shipdayCarrierId
    ) ||
    shipdayCarrierId <= 0
  ) {
    throw new MarketplaceSettlementActivationError(
      "DRIVER_NOT_ASSIGNED",
      "The completed order has no valid Shipday carrier."
    );
  }

  const driverDocument =
    await db
      .collection("drivers")
      .doc(driverId)
      .get();

  if (
    !driverDocument.exists
  ) {
    throw new MarketplaceSettlementActivationError(
      "DRIVER_NOT_FOUND",
      "The assigned LIA driver was not found."
    );
  }

  const driver =
    driverDocument.data() ?? {};

  if (
    driver.isApproved !==
    true
  ) {
    throw new MarketplaceSettlementActivationError(
      "DRIVER_NOT_APPROVED",
      "The assigned driver is not approved."
    );
  }

  if (
    driver.shipday?.carrierId !==
    shipdayCarrierId
  ) {
    throw new MarketplaceSettlementActivationError(
      "DRIVER_NOT_ASSIGNED",
      "The assigned driver does not match the Shipday carrier recorded on the order."
    );
  }

  const stripeAccountId =
    requireString(
      driver.stripeAccountId,
      "DRIVER_PAYOUT_NOT_READY",
      "The assigned driver has no connected Stripe account."
    );

  if (
    !stripeAccountId.startsWith(
      "acct_"
    )
  ) {
    throw new MarketplaceSettlementActivationError(
      "DRIVER_PAYOUT_NOT_READY",
      "The assigned driver Stripe account is invalid."
    );
  }

  if (
    driver.stripeTransfersEnabled !==
      true ||
    driver.stripePayoutsEnabled !==
      true ||
    driver.stripeIsReady !==
      true
  ) {
    throw new MarketplaceSettlementActivationError(
      "DRIVER_PAYOUT_NOT_READY",
      "The assigned driver Stripe account is not ready to receive settlement funds."
    );
  }

  return {
    driverId,

    stripeAccountId,
  };
}

/*
|--------------------------------------------------------------------------
| Allocation Conservation
|--------------------------------------------------------------------------
|
| Every customer-paid cent must belong to exactly one destination:
|
| - Store settlement
| - Driver settlement
| - LIA retained revenue
|
*/

function validateAllocationConservation(
  pricing:
    TrustedMarketplacePricing,
  allocation:
    PaymentAllocation
): void {
  const allocatedTotal =
    allocation.store
      .transferAmount +
    allocation.driver
      .transferAmount +
    allocation.platform
      .totalRevenue;

  if (
    allocatedTotal !==
    pricing.totalAmount
  ) {
    throw new MarketplaceSettlementActivationError(
      "PAYMENT_TOTAL_MISMATCH",
      "The marketplace allocation does not account for the complete customer payment."
    );
  }

  if (
    allocation.store.salesTax !==
    pricing.taxAmount
  ) {
    throw new MarketplaceSettlementActivationError(
      "PAYMENT_TOTAL_MISMATCH",
      "The complete sales-tax amount was not allocated to the store."
    );
  }

  if (
    allocation.driver.driverTip !==
    pricing.tipAmount
  ) {
    throw new MarketplaceSettlementActivationError(
      "PAYMENT_TOTAL_MISMATCH",
      "The complete driver tip was not allocated to the driver."
    );
  }
}

/*
|--------------------------------------------------------------------------
| Activate Settlement
|--------------------------------------------------------------------------
*/

async function activate(
  input:
    ActivateMarketplaceSettlementInput
): Promise<
  ActivateMarketplaceSettlementResult
> {
  const orderId =
    requireIdentifier(
      input.orderId,
      "Order ID"
    );

  try {
    /*
    |--------------------------------------------------------------------------
    | Load Order
    |--------------------------------------------------------------------------
    */

    const orderDocument =
      await db
        .collection("orders")
        .doc(orderId)
        .get();

    if (
      !orderDocument.exists
    ) {
      throw new MarketplaceSettlementActivationError(
        "ORDER_NOT_FOUND",
        "The completed order was not found."
      );
    }

    const order =
      orderDocument.data();

    if (!order) {
      throw new MarketplaceSettlementActivationError(
        "INVALID_ORDER",
        "The completed order data is missing."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Validate Trusted Sources
    |--------------------------------------------------------------------------
    */

    validateOrderState(
      order
    );

    const pricing =
      getTrustedPricing(
        order
      );

    const paymentSource =
      getTrustedPaymentSource(
        order
      );

    const [
      storePayout,
      driverPayout,
      driverCommissionBasisPoints,
    ] =
      await Promise.all([
        getTrustedStorePayout(
          order
        ),

        order.fulfillmentType === "pickup"
          ? Promise.resolve(null)
          : getTrustedDriverPayout(order),
        getConfiguredDriverCommissionBasisPoints(),
      ]);

    /*
    |--------------------------------------------------------------------------
    | Calculate Allocation
    |--------------------------------------------------------------------------
    */

      let orderPricingPolicy;
      try {
        orderPricingPolicy = parseMarketplacePricingPolicy(order.pricingPolicy ?? {});
      } catch {
        throw new MarketplaceSettlementActivationError(
          "INVALID_ORDER",
          "The order is missing its immutable marketplace pricing policy.",
        );
      }

      const allocation =
      calculatePaymentAllocation({
        fulfillmentType: order.fulfillmentType === "pickup" ? "pickup" : "delivery",
        merchandiseSubtotal:
          pricing.subtotalAmount,

        salesTax:
          pricing.taxAmount,

        deliveryFee:
          pricing.deliveryFeeAmount,

        driverTip:
          pricing.tipAmount,

        serviceFee:
          pricing.serviceFeeAmount,
        storeCommissionBasisPoints:
          storePayout.storeCommissionBasisPoints,
        driverCommissionBasisPoints,
        driverMinimumPayCents: orderPricingPolicy.driverMinimumPayCents,
        freeDeliveryMinimumCents: orderPricingPolicy.freeDeliveryMinimumCents,
        freeDeliveryDriverIncentiveWithoutTipCents:
          orderPricingPolicy.freeDeliveryDriverIncentiveWithoutTipCents,
        freeDeliveryDriverIncentiveWithTipCents:
          orderPricingPolicy.freeDeliveryDriverIncentiveWithTipCents,
      });

    validateAllocationConservation(
      pricing,
      allocation
    );

    /*
    |--------------------------------------------------------------------------
    | Create Settlement
    |--------------------------------------------------------------------------
    |
    | The order ID is the deterministic settlement document ID.
    |
    */

    const settlementResult =
      await createSettlement({
        orderId,

        storeId:
          storePayout.storeId,

        driverId:
          driverPayout?.driverId ?? null,

        storeAmount:
          allocation.store
            .transferAmount,

        driverAmount:
          allocation.driver
            .transferAmount,

        currency:
          "usd",
      });

    /*
    |--------------------------------------------------------------------------
    | Settlement Ledger
    |--------------------------------------------------------------------------
    |
    | Only the process that creates the settlement writes these entries.
    |
    | A retry that reuses the existing settlement will not duplicate them.
    |
    */

    if (
      settlementResult.created
    ) {
      await createLedgerEntry({
            orderId,

            event:
              "allocation_created",

            eventKey:
              "allocation_created",

            amount:
              pricing.totalAmount,

            description:
              "Marketplace payment allocation created.",

            metadata: {
              settlementId:
                settlementResult
                  .settlementId,

              storeAmount:
                allocation.store
                  .transferAmount,

              driverAmount:
                allocation.driver
                  .transferAmount,

              platformRevenue:
                allocation.platform
                  .totalRevenue,
              storeCommissionBasisPoints:
                storePayout.storeCommissionBasisPoints,
              driverCommissionBasisPoints,

              salesTax:
                allocation.store
                  .salesTax,

              driverTip:
                allocation.driver
                  .driverTip,
            },
          });

                await createLedgerEntry({
            orderId,

            event:
              "settlement_created",

            eventKey:
              "settlement_created",

            amount:
              allocation.store
                .transferAmount +
              allocation.driver
                .transferAmount,

            description:
              "Store and driver settlement obligations created.",

            metadata: {
              settlementId:
                settlementResult
                  .settlementId,

              storeId:
                storePayout.storeId,

              driverId:
                driverPayout?.driverId ?? null,
            },
          });
    }

    /*
    |--------------------------------------------------------------------------
    | Prepare Transfers
    |--------------------------------------------------------------------------
    |
    | The settlement processor creates deterministic store and driver
    | transfer records and marks them eligible.
    |
    | It still does not call Stripe.
    |
    */

    const processingResult =
      await paymentSettlementProcessor
        .process({
          settlementId:
            settlementResult
              .settlementId,

          storeStripeAccountId:
            storePayout
              .stripeAccountId,

          driverStripeAccountId:
            driverPayout?.stripeAccountId ?? null,

          source: {
            stripePaymentIntentId:
              paymentSource
                .paymentIntentId,

            stripeChargeId:
              paymentSource
                .stripeChargeId,

            transferGroup:
              paymentSource
                .transferGroup,
          },
        });

    /*
    |--------------------------------------------------------------------------
    | Transfer Ledger
    |--------------------------------------------------------------------------
    |
    | Ledger entries are written only when the underlying transfer record
    | was newly created.
    |
    */

    if (
      processingResult
        .storeTransfer
        .created
    ) {
      await createLedgerEntry({
          orderId,

          event:
            "store_transfer_created",

          eventKey:
            "store_transfer_created",

          amount:
            allocation.store
              .transferAmount,

          description:
            "Store transfer obligation created.",

          metadata: {
            settlementId:
              settlementResult
                .settlementId,

            transferId:
              processingResult
                .storeTransfer
                .transferId,

            storeId:
              storePayout.storeId,
          },
        });
            }

            if (processingResult.driverTransfer?.created && driverPayout) {
              await createLedgerEntry({
          orderId,

          event:
            "driver_transfer_created",

          eventKey:
            "driver_transfer_created",

          amount:
            allocation.driver
              .transferAmount,

          description:
            "Driver transfer obligation created.",

          metadata: {
            settlementId:
              settlementResult
                .settlementId,

            transferId:
              processingResult
                .driverTransfer
                .transferId,

            driverId:
              driverPayout.driverId,
          },
        });
    }

    /*
    |--------------------------------------------------------------------------
    | Result
    |--------------------------------------------------------------------------
    */

    return {
      orderId,

      settlementId:
        settlementResult
          .settlementId,

      settlementCreated:
        settlementResult
          .created,

      storeTransferId:
        processingResult
          .storeTransfer
          .transferId,

      storeTransferCreated:
        processingResult
          .storeTransfer
          .created,

      driverTransferId:
        processingResult.driverTransfer?.transferId ?? null,

      driverTransferCreated:
        processingResult.driverTransfer?.created ?? false,

      allocation,
    };
  } catch (
    error: unknown
  ) {
    if (
      error instanceof
      MarketplaceSettlementActivationError
    ) {
      throw error;
    }

    const causeMessage =
      getSafeErrorMessage(
        error
      );

    console.error(
      "Marketplace settlement activation failed.",
      {
        orderId,
        error:
          causeMessage,
      }
    );

    throw new MarketplaceSettlementActivationError(
      "SETTLEMENT_ACTIVATION_FAILED",
      "The completed order could not be prepared for marketplace settlement.",
      causeMessage
    );
  }
}

/*
|--------------------------------------------------------------------------
| Type Guard
|--------------------------------------------------------------------------
*/

export function isMarketplaceSettlementActivationError(
  error: unknown
): error is MarketplaceSettlementActivationError {
  return (
    error instanceof
    MarketplaceSettlementActivationError
  );
}

/*
|--------------------------------------------------------------------------
| Service
|--------------------------------------------------------------------------
*/

export const marketplaceSettlementActivationService = {
  activate,
};

/*
|--------------------------------------------------------------------------
| Paid Order Activation Service
|--------------------------------------------------------------------------
|
| Activates a payment-pending LIA order after Stripe confirms payment.
|
| This service is called only from the verified Stripe payment webhook.
|
| Responsibilities:
|
| - Load and validate the pending order
| - Verify PaymentIntent metadata and trusted payment amounts
| - Recheck product ownership, availability, and stock
| - Deduct inventory exactly once
| - Mark payment paid
| - Confirm the checkout
| - Create the initial fulfillment timeline
| - Confirm the related LIA checkout session
| - Return notification data after the transaction commits
|
| Important:
|
| This service does NOT:
|
| - Verify the Stripe webhook signature
| - Send push notifications inside the Firestore transaction
| - Create a Shipday delivery
| - Transfer money to the store or driver
*/

import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Transaction,
} from "firebase-admin/firestore";

import type {
  PaidOrderActivationResult,
  ValidatedStripePaymentEvent,
} from "../stripe/stripePaymentWebhookTypes";


/*
|--------------------------------------------------------------------------
| Firestore
|--------------------------------------------------------------------------
*/

const db =
  getFirestore("default");


/*
|--------------------------------------------------------------------------
| Stock Alert Thresholds
|--------------------------------------------------------------------------
|
| Thresholds used when paid checkout activation reduces inventory.
|
*/

const LOW_STOCK_THRESHOLDS = [
  20,
  15,
  10,
  5,
  0,
] as const;


/*
|--------------------------------------------------------------------------
| Errors
|--------------------------------------------------------------------------
*/

export type PaidOrderActivationErrorCode =
  | "ORDER_NOT_FOUND"
  | "INVALID_ORDER"
  | "PAYMENT_INTENT_MISMATCH"
  | "PAYMENT_CHARGE_MISMATCH"
  | "PAYMENT_AMOUNT_MISMATCH"
  | "PAYMENT_CUSTOMER_MISMATCH"
  | "PAYMENT_STORE_MISMATCH"
  | "ORDER_ALREADY_FAILED"
  | "CHECKOUT_SESSION_NOT_FOUND"
  | "CHECKOUT_SESSION_MISMATCH"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_STORE_MISMATCH"
  | "PRODUCT_UNAVAILABLE"
  | "INSUFFICIENT_STOCK"
  | "ORDER_ACTIVATION_FAILED";


export class PaidOrderActivationError extends Error {
  readonly code:
    PaidOrderActivationErrorCode;

  constructor(
    code:
      PaidOrderActivationErrorCode,
    message: string
  ) {
    super(message);

    this.name =
      "PaidOrderActivationError";

    this.code =
      code;
  }
}


/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function getRequiredString(
  value: unknown,
  code:
    PaidOrderActivationErrorCode,
  message: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new PaidOrderActivationError(
      code,
      message
    );
  }

  return value.trim();
}

/*
|--------------------------------------------------------------------------
| Stripe Charge Validation
|--------------------------------------------------------------------------
|
| A successful PaymentIntent must have a Stripe Charge.
|
| The Charge becomes the trusted source_transaction used later when LIA
| transfers funds to the store and driver after delivery.
|
*/

function getRequiredStripeChargeId(
  value: unknown
): string {
  const chargeId =
    getRequiredString(
      value,
      "PAYMENT_CHARGE_MISMATCH",
      "The successful Stripe payment is missing its Charge ID."
    );

  if (
    !chargeId.startsWith(
      "ch_"
    )
  ) {
    throw new PaidOrderActivationError(
      "PAYMENT_CHARGE_MISMATCH",
      "The Stripe Charge ID is invalid."
    );
  }

  return chargeId;
}


function getRequiredCentAmount(
  value: unknown,
  code:
    PaidOrderActivationErrorCode,
  message: string
): number {
  if (
    !Number.isSafeInteger(
      value
    ) ||
    Number(value) <= 0
  ) {
    throw new PaidOrderActivationError(
      code,
      message
    );
  }

  return Number(value);
}


function getOrderItems(
  value: unknown
): DocumentData[] {
  if (
    !Array.isArray(value) ||
    value.length === 0
  ) {
    throw new PaidOrderActivationError(
      "INVALID_ORDER",
      "The order contains no valid products."
    );
  }

  return value;
}


function hasCrossedLowStockThreshold(
  previousStock: number,
  remainingStock: number
): boolean {
  return LOW_STOCK_THRESHOLDS.some(
    (
      threshold
    ) =>
      previousStock >
        threshold &&
      remainingStock <=
        threshold
  );
}


/*
|--------------------------------------------------------------------------
| Already Activated
|--------------------------------------------------------------------------
|
| Stripe can redeliver events.
|
| The event service already prevents duplicate event processing, but a
| different Stripe event delivery may still describe a PaymentIntent
| that has already activated the order.
|
| The order itself therefore remains the final idempotency boundary.
|
*/

function buildAlreadyActivatedResult(
  orderId: string,
  orderData:
    DocumentData
): PaidOrderActivationResult {
  return {
    orderId,

    orderNumber:
      getRequiredString(
        orderData.orderNumber,
        "INVALID_ORDER",
        "The order number is invalid."
      ),

    storeId:
      getRequiredString(
        orderData.store?.id,
        "INVALID_ORDER",
        "The order store is invalid."
      ),

    storeOwnerUid:
      getRequiredString(
        orderData.store?.ownerId,
        "INVALID_ORDER",
        "The store owner is invalid."
      ),

    customerUid:
      getRequiredString(
        orderData.customer?.uid,
        "INVALID_ORDER",
        "The customer is invalid."
      ),

    newlyActivated:
      false,

    lowStockAlerts: [],
  };
}


/*
|--------------------------------------------------------------------------
| Validate Payment Relationship
|--------------------------------------------------------------------------
*/

function validateOrderPaymentRelationship(
  orderData:
    DocumentData,
  paymentEvent:
    ValidatedStripePaymentEvent
): void {
  const storedPaymentIntentId =
    getRequiredString(
      orderData.payment
        ?.paymentIntentId,
      "PAYMENT_INTENT_MISMATCH",
      "The order is missing its Stripe PaymentIntent."
    );

  if (
    storedPaymentIntentId !==
    paymentEvent.paymentIntentId
  ) {
    throw new PaidOrderActivationError(
      "PAYMENT_INTENT_MISMATCH",
      "The Stripe PaymentIntent does not belong to this order."
    );
  }

  const storedTotalAmount =
    getRequiredCentAmount(
      orderData.pricing
        ?.totalAmount,
      "PAYMENT_AMOUNT_MISMATCH",
      "The order payment amount is invalid."
    );

  if (
    storedTotalAmount !==
      paymentEvent.amount ||
    storedTotalAmount !==
      paymentEvent.amountReceived ||
    paymentEvent.currency !==
      "usd"
  ) {
    throw new PaidOrderActivationError(
      "PAYMENT_AMOUNT_MISMATCH",
      "The Stripe payment amount does not match the trusted order total."
    );
  }

  const storedCustomerUid =
    getRequiredString(
      orderData.customer?.uid,
      "PAYMENT_CUSTOMER_MISMATCH",
      "The order customer is invalid."
    );

  if (
    storedCustomerUid !==
      paymentEvent.metadata
        .customerUid
  ) {
    throw new PaidOrderActivationError(
      "PAYMENT_CUSTOMER_MISMATCH",
      "The Stripe payment customer does not match the order."
    );
  }

  const storedStoreId =
    getRequiredString(
      orderData.store?.id,
      "PAYMENT_STORE_MISMATCH",
      "The order store is invalid."
    );

  if (
    storedStoreId !==
      paymentEvent.metadata
        .storeId
  ) {
    throw new PaidOrderActivationError(
      "PAYMENT_STORE_MISMATCH",
      "The Stripe payment store does not match the order."
    );
  }

  const storedStoreStripeAccountId =
    getRequiredString(
      orderData.payout
        ?.storeStripeAccountId,
      "PAYMENT_STORE_MISMATCH",
      "The order store Stripe account is invalid."
    );

  if (
    storedStoreStripeAccountId !==
      paymentEvent.metadata
        .storeStripeAccountId
  ) {
    throw new PaidOrderActivationError(
      "PAYMENT_STORE_MISMATCH",
      "The Stripe connected account does not match the order."
    );
  }

  if (
    paymentEvent.customerId !==
      paymentEvent.metadata
        .stripeCustomerId
  ) {
    throw new PaidOrderActivationError(
      "PAYMENT_CUSTOMER_MISMATCH",
      "The Stripe Customer does not match the payment metadata."
    );
  }
}


/*
|--------------------------------------------------------------------------
| Checkout Session Validation
|--------------------------------------------------------------------------
*/

function getCheckoutSessionReference(
  orderData:
    DocumentData,
  paymentEvent:
    ValidatedStripePaymentEvent
): DocumentReference {
  /*
    The current order does not yet store sessionId directly.

    The deterministic session ID is:

    {customerUid}_{fingerprint}

    Because the order currently does not store the fingerprint either,
    locate the session through its orderId query outside the transaction
    would weaken atomicity.

    Therefore, before using this service, the pending-order creation flow
    must store checkoutSessionId on the order.

    We deliberately fail clearly until that relationship is added.
  */

  const checkoutSessionId =
    getRequiredString(
      orderData.checkoutSessionId,
      "CHECKOUT_SESSION_NOT_FOUND",
      "The order is missing its checkout session reference."
    );

  const customerUid =
    getRequiredString(
      orderData.customer?.uid,
      "CHECKOUT_SESSION_MISMATCH",
      "The order customer is invalid."
    );

  if (
    customerUid !==
      paymentEvent.metadata
        .customerUid
  ) {
    throw new PaidOrderActivationError(
      "CHECKOUT_SESSION_MISMATCH",
      "The checkout-session customer does not match the payment."
    );
  }

  return db
    .collection(
      "checkoutSessions"
    )
    .doc(
      checkoutSessionId
    );
}


/*
|--------------------------------------------------------------------------
| Activate Paid Order
|--------------------------------------------------------------------------
*/

async function activatePaidOrder(
  paymentEvent:
    ValidatedStripePaymentEvent
): Promise<
  PaidOrderActivationResult
> {
  const orderId =
    paymentEvent.metadata
      .orderId;

  const orderReference =
    db.collection(
      "orders"
    ).doc(
      orderId
    );

  try {
    return await db.runTransaction(
      async (
        transaction:
          Transaction
      ): Promise<
        PaidOrderActivationResult
      > => {
        /*
        |--------------------------------------------------------------------------
        | Load Order
        |--------------------------------------------------------------------------
        */

        const orderSnapshot =
          await transaction.get(
            orderReference
          );

        if (!orderSnapshot.exists) {
          throw new PaidOrderActivationError(
            "ORDER_NOT_FOUND",
            "The Stripe payment references an order that does not exist."
          );
        }

        const orderData =
          orderSnapshot.data() ?? {};

        /*
        |--------------------------------------------------------------------------
        | Order-Level Idempotency
        |--------------------------------------------------------------------------
        */

        if (
          orderData.checkoutStatus ===
            "confirmed" &&
          orderData.payment?.status ===
            "paid"
        ) {
          return buildAlreadyActivatedResult(
            orderSnapshot.id,
            orderData
          );
        }

        if (
          orderData.checkoutStatus ===
            "payment_failed" ||
          orderData.checkoutStatus ===
            "expired" ||
          orderData.checkoutStatus ===
            "cancelled"
        ) {
          throw new PaidOrderActivationError(
            "ORDER_ALREADY_FAILED",
            "This checkout can no longer be activated."
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Validate Payment
        |--------------------------------------------------------------------------
        */

        validateOrderPaymentRelationship(
          orderData,
          paymentEvent
        );

          /*
          * Only a succeeded PaymentIntent activates an order.
          *
          * Its Charge ID is required because later marketplace transfers use
          * that charge as their source_transaction.
          */
          getRequiredStripeChargeId(
            paymentEvent.stripeChargeId
          );

        /*
        |--------------------------------------------------------------------------
        | Load Checkout Session
        |--------------------------------------------------------------------------
        */

        const checkoutSessionReference =
          getCheckoutSessionReference(
            orderData,
            paymentEvent
          );

        const checkoutSessionSnapshot =
          await transaction.get(
            checkoutSessionReference
          );

        if (
          !checkoutSessionSnapshot
            .exists
        ) {
          throw new PaidOrderActivationError(
            "CHECKOUT_SESSION_NOT_FOUND",
            "The related checkout session does not exist."
          );
        }

        const checkoutSessionData =
          checkoutSessionSnapshot
            .data() ?? {};

        if (
          checkoutSessionData.orderId !==
            orderSnapshot.id ||
          checkoutSessionData
            .paymentIntentId !==
            paymentEvent
              .paymentIntentId ||
          checkoutSessionData
            .customerUid !==
            paymentEvent.metadata
              .customerUid ||
          checkoutSessionData
            .storeId !==
            paymentEvent.metadata
              .storeId
        ) {
          throw new PaidOrderActivationError(
            "CHECKOUT_SESSION_MISMATCH",
            "The checkout session does not match the paid order."
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Load Products
        |--------------------------------------------------------------------------
        */

        const orderItems =
          getOrderItems(
            orderData.items
          );

        const productReferences:
          DocumentReference[] =
          orderItems.map(
            (
              item
            ) => {
              const productId =
                getRequiredString(
                  item.id,
                  "INVALID_ORDER",
                  "An order product ID is invalid."
                );

              return db
                .collection(
                  "products"
                )
                .doc(
                  productId
                );
            }
          );

        const productSnapshots:
          DocumentSnapshot[] = [];

        for (
          const productReference
          of productReferences
        ) {
          productSnapshots.push(
            await transaction.get(
              productReference
            )
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Validate And Deduct Inventory
        |--------------------------------------------------------------------------
        */

        const lowStockAlerts:
          PaidOrderActivationResult[
            "lowStockAlerts"
          ] = [];

        productSnapshots.forEach(
          (
            productSnapshot,
            index
          ) => {
            const orderedItem =
              orderItems[index];

            if (
              !productSnapshot.exists
            ) {
              throw new PaidOrderActivationError(
                "PRODUCT_NOT_FOUND",
                `${orderedItem.name ?? "A product"} is no longer available.`
              );
            }

            const productData =
              productSnapshot.data() ??
              {};

            const orderedQuantity =
              Number(
                orderedItem.quantity
              );

            if (
              !Number.isSafeInteger(
                orderedQuantity
              ) ||
              orderedQuantity <= 0
            ) {
              throw new PaidOrderActivationError(
                "INVALID_ORDER",
                "An ordered quantity is invalid."
              );
            }

            const availableStock =
              Number(
                productData.stock
              );

            if (
              !Number.isSafeInteger(
                availableStock
              ) ||
              availableStock < 0
            ) {
              throw new PaidOrderActivationError(
                "PRODUCT_UNAVAILABLE",
                "A product has invalid inventory data."
              );
            }

            const orderStoreId =
              getRequiredString(
                orderData.store?.id,
                "INVALID_ORDER",
                "The order store is invalid."
              );

            if (
              productData.storeId !==
              orderStoreId
            ) {
              throw new PaidOrderActivationError(
                "PRODUCT_STORE_MISMATCH",
                `${orderedItem.name ?? "A product"} does not belong to this store.`
              );
            }

            if (
              productData.isAvailable ===
              false
            ) {
              throw new PaidOrderActivationError(
                "PRODUCT_UNAVAILABLE",
                `${orderedItem.name ?? "A product"} is no longer available.`
              );
            }

            if (
              availableStock <
              orderedQuantity
            ) {
              throw new PaidOrderActivationError(
                "INSUFFICIENT_STOCK",
                `${orderedItem.name ?? "A product"} no longer has enough stock available.`
              );
            }

            const remainingStock =
              availableStock -
              orderedQuantity;

            transaction.update(
              productSnapshot.ref,
              {
                stock:
                  remainingStock,

                updatedAt:
                  FieldValue
                    .serverTimestamp(),
              }
            );

            if (
              hasCrossedLowStockThreshold(
                availableStock,
                remainingStock
              )
            ) {
              lowStockAlerts.push({
                productId:
                  productSnapshot.id,

                productName:
                  typeof productData
                    .name ===
                    "string" &&
                  productData
                    .name
                    .trim()
                    ? productData
                        .name
                    : String(
                        orderedItem
                          .name ??
                        "Product"
                      ),

                remainingStock,
              });
            }
          }
        );


                /*
        |--------------------------------------------------------------------------
        | Marketplace Transfer Source
        |--------------------------------------------------------------------------
        |
        | Both the future store transfer and driver transfer are associated
        | with the same original customer Charge.
        |
        | The transfer group is deterministic for this order.
        |
        */

        const stripeChargeId =
          getRequiredStripeChargeId(
            paymentEvent
              .stripeChargeId
          );

        const transferGroup =
          `lia_order_${orderSnapshot.id}`;

        /*
        |--------------------------------------------------------------------------
        | Confirm Order
        |--------------------------------------------------------------------------
        */

        const paidAt =
          Timestamp.fromMillis(
            paymentEvent
              .stripeCreatedAt *
            1000
          );

        transaction.update(
          orderReference,
          {
            checkoutStatus:
              "confirmed",

            status:
              "pending",

            statusHistory: [
              {
                status:
                  "pending",

                timestamp:
                  paidAt,

                note:
                  "Payment confirmed. Order sent to the store.",
              },
            ],

            "payment.status":
              "paid",

            "payment.stripeStatus":
              paymentEvent
                .paymentIntentStatus,

                        "payment.stripeChargeId":
              stripeChargeId,

            "payment.transferGroup":
              transferGroup,

            "payment.architecture":
              "separate_charges_and_transfers",

            "payment.version":
              "v1",

            "payment.amountReceived":
              paymentEvent
                .amountReceived,

            "payment.currency":
              paymentEvent
                .currency,

            "payment.paidAt":
              paidAt,

            "payment.failureReason":
              FieldValue
                .delete(),

            "payment.updatedAt":
              FieldValue
                .serverTimestamp(),

            updatedAt:
              FieldValue
                .serverTimestamp(),
          }
        );

        /*
         * Clear the authenticated customer's saved cart in the same commit
         * that makes the order visible to the store. The cart is never
         * cleared for awaiting, failed, expired, or cancelled checkouts.
         *
         * At commit, this order has both:
         * - checkoutStatus: confirmed
         * - payment.status: paid
         */
        const customerUid =
          getRequiredString(
            orderData.customer?.uid,
            "INVALID_ORDER",
            "The order customer is invalid."
          );

        transaction.delete(
          db.collection("carts").doc(customerUid)
        );

        /*
        |--------------------------------------------------------------------------
        | Confirm Checkout Session
        |--------------------------------------------------------------------------
        */

        transaction.update(
          checkoutSessionReference,
          {
            status:
              "confirmed",

            confirmedAt:
              paidAt,

            updatedAt:
              FieldValue
                .serverTimestamp(),
          }
        );

        /*
        |--------------------------------------------------------------------------
        | Result
        |--------------------------------------------------------------------------
        */

        return {
          orderId:
            orderSnapshot.id,

          orderNumber:
            getRequiredString(
              orderData.orderNumber,
              "INVALID_ORDER",
              "The order number is invalid."
            ),

          storeId:
            getRequiredString(
              orderData.store?.id,
              "INVALID_ORDER",
              "The order store is invalid."
            ),

          storeOwnerUid:
            getRequiredString(
              orderData.store
                ?.ownerId,
              "INVALID_ORDER",
              "The store owner is invalid."
            ),

          customerUid:
            getRequiredString(
              orderData.customer
                ?.uid,
              "INVALID_ORDER",
              "The customer is invalid."
            ),

          newlyActivated:
            true,

          lowStockAlerts,
        };
      }
    );
  } catch (
    error: unknown
  ) {
    if (
      error instanceof
      PaidOrderActivationError
    ) {
      throw error;
    }

    console.error(
      "Paid order activation failed:",
      {
        eventId:
          paymentEvent.eventId,

        paymentIntentId:
          paymentEvent
            .paymentIntentId,

        orderId,

        error,
      }
    );

    throw new PaidOrderActivationError(
      "ORDER_ACTIVATION_FAILED",
      "The paid order could not be activated."
    );
  }
}


/*
|--------------------------------------------------------------------------
| Type Guard
|--------------------------------------------------------------------------
*/

export function isPaidOrderActivationError(
  error: unknown
): error is PaidOrderActivationError {
  return (
    error instanceof
    PaidOrderActivationError
  );
}


/*
|--------------------------------------------------------------------------
| Service
|--------------------------------------------------------------------------
*/

export const paidOrderActivationService = {
  activatePaidOrder,
};

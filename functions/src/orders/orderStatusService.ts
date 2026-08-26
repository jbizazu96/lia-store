/*
|--------------------------------------------------------------------------
| Order Status Service
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Owns protected store-controlled order status transitions.
|
| The frontend is not trusted to:
|
| • Update order documents directly
| • Decide whether a status transition is valid
| • Decide whether Shipday should run
| • Add fulfillment timeline entries
|
| This service:
|
| • Loads the trusted order from Firestore
| • Verifies that the authenticated user owns the store
| • Verifies that Stripe confirmed the checkout
| • Validates the requested status transition
| • Updates the status inside a Firestore transaction
| • Adds one trusted status-history entry
| • Reports whether the order newly reached ready_for_pickup
|
| Important:
|
| This service does NOT contact Shipday.
|
| External API calls must happen after the Firestore transaction commits.
|
*/

import {
  DocumentData,
  FieldValue,
  Timestamp,
  UpdateData,
  getFirestore,
} from "firebase-admin/firestore";
import {isAllowedStoreOrderTransition} from "./orderStatusTransitions";


const db =
  getFirestore("default");


/*
|--------------------------------------------------------------------------
| Order Status Types
|--------------------------------------------------------------------------
|
| These are the fulfillment statuses understood by the backend.
|
| Store-controlled statuses:
|
| pending
| accepted
| preparing
| ready_for_pickup
| cancelled
|
| Shipday or system-controlled statuses:
|
| out_for_delivery
| completed
|
*/

export type BackendOrderStatus =
  | "pending"
  | "accepted"
  | "preparing"
  | "ready_for_pickup"
  | "out_for_delivery"
  | "completed"
  | "cancelled";


/*
  Statuses that a store owner may request through the callable function.
*/
export type StoreControlledOrderStatus =
  | "accepted"
  | "preparing"
  | "ready_for_pickup"
  | "cancelled";


/*
|--------------------------------------------------------------------------
| Service Input
|--------------------------------------------------------------------------
*/

export interface UpdateStoreOrderStatusInput {
  /*
    Authenticated Firebase user requesting the change.
  */
  requesterUid: string;

  /* Store identity already authorized by the callable. */
  authorizedStoreId?: string;

  /*
    Firestore order document ID.
  */
  orderId: string;

  /*
    Requested store-controlled fulfillment status.
  */
  newStatus:
    StoreControlledOrderStatus;

  /*
    Required only when cancelling an order.
  */
  cancellationReason?: string;
}


/*
|--------------------------------------------------------------------------
| Service Result
|--------------------------------------------------------------------------
|
| newlyReadyForPickup tells the caller whether this exact request created
| the ready_for_pickup transition.
|
| The callable will later use that result to trigger the protected Shipday
| fulfillment service after the transaction commits.
|
*/

export interface UpdateStoreOrderStatusResult {
  fulfillmentType: "delivery" | "pickup";
  orderId: string;

  orderNumber: string;

  previousStatus:
    BackendOrderStatus;

  currentStatus:
    BackendOrderStatus;

  changedAt: string;

  changed: boolean;

  newlyReadyForPickup: boolean;
}


/*
|--------------------------------------------------------------------------
| Expected Firestore Order Shape
|--------------------------------------------------------------------------
|
| Only fields required by this workflow are represented here.
|
| Other order fields may exist without being coupled to this service.
|
*/

interface StatusWorkflowOrder {
  fulfillmentType?: unknown;
  orderNumber?: unknown;

  status?: unknown;

  checkoutStatus?: unknown;

  customer?: {
    uid?: unknown;
  };

  store?: {
    id?: unknown;

    ownerId?: unknown;
  };

  payment?: {
    status?: unknown;
  };

  shipday?: {
    orderId?: unknown;

    status?: unknown;

    active?: unknown;
  };
}


/*
|--------------------------------------------------------------------------
| Error Model
|--------------------------------------------------------------------------
|
| The callable function will later convert these predictable domain errors
| into Firebase HttpsError codes.
|
*/

export type OrderStatusServiceErrorCode =
  | "INVALID_REQUEST"
  | "ORDER_NOT_FOUND"
  | "FORBIDDEN"
  | "PAYMENT_NOT_CONFIRMED"
  | "INVALID_CURRENT_STATUS"
  | "INVALID_TRANSITION"
  | "CANCELLATION_REASON_REQUIRED";


export class OrderStatusServiceError extends Error {
  readonly code:
    OrderStatusServiceErrorCode;

  constructor(
    code: OrderStatusServiceErrorCode,
    message: string
  ) {
    super(message);

    this.name =
      "OrderStatusServiceError";

    this.code =
      code;
  }
}


/*
|--------------------------------------------------------------------------
| Status Guards
|--------------------------------------------------------------------------
*/

function isBackendOrderStatus(
  value: unknown
): value is BackendOrderStatus {
  return (
    value === "pending" ||
    value === "accepted" ||
    value === "preparing" ||
    value === "ready_for_pickup" ||
    value === "out_for_delivery" ||
    value === "completed" ||
    value === "cancelled"
  );
}


function isStoreControlledOrderStatus(
  value: unknown
): value is StoreControlledOrderStatus {
  return (
    value === "accepted" ||
    value === "preparing" ||
    value === "ready_for_pickup" ||
    value === "cancelled"
  );
}


/*
|--------------------------------------------------------------------------
| Transition Rules
|--------------------------------------------------------------------------
|
| Store-controlled forward workflow:
|
| pending
|    ↓
| accepted
|    ↓
| preparing
|    ↓
| ready_for_pickup
|
| Cancellation is currently allowed before Shipday-controlled delivery
| begins.
|
| The store cannot:
|
| • Skip preparation steps
| • Move an order backwards
| • Mark an order out for delivery
| • Mark an order completed
| • Modify an already cancelled order
|
*/

/*
|--------------------------------------------------------------------------
| Normalization
|--------------------------------------------------------------------------
*/

function normalizeRequiredString(
  value: string,
  fieldName: string
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new OrderStatusServiceError(
      "INVALID_REQUEST",
      `${fieldName} is required.`
    );
  }

  return normalized;
}


function normalizeCancellationReason(
  newStatus: StoreControlledOrderStatus,
  cancellationReason?: string
): string | null {
  const normalizedReason =
    cancellationReason?.trim() ?? "";

  if (
    newStatus === "cancelled" &&
    !normalizedReason
  ) {
    throw new OrderStatusServiceError(
      "CANCELLATION_REASON_REQUIRED",
      "A cancellation reason is required."
    );
  }

  if (!normalizedReason) {
    return null;
  }

  /*
    Prevent excessively large untrusted strings from being written into
    the order document.
  */
  return normalizedReason.slice(
    0,
    500
  );
}


/*
|--------------------------------------------------------------------------
| Status-History Note
|--------------------------------------------------------------------------
*/

function buildStatusNote(
  newStatus: StoreControlledOrderStatus,
  cancellationReason: string | null,
  fulfillmentType: "delivery" | "pickup",
): string {
  if (
    newStatus === "cancelled" &&
    cancellationReason
  ) {
    return `Order cancelled: ${cancellationReason}`;
  }

  const labels: Record<
    Exclude<
      StoreControlledOrderStatus,
      "cancelled"
    >,
    string
  > = {
    accepted:
      "Order accepted by the store.",

    preparing:
      "The store started preparing the order.",

    ready_for_pickup: fulfillmentType === "pickup"
      ? "The order is ready for customer pickup."
      : "The order is ready for driver pickup.",
  };

  if (newStatus === "cancelled") {
    return "Order cancelled.";
  }

  return labels[newStatus];
}


/*
|--------------------------------------------------------------------------
| Confirmed-Payment Guard
|--------------------------------------------------------------------------
|
| Fulfillment must never start for an unpaid or unconfirmed checkout.
|
*/

function assertOrderIsConfirmed(
  order: StatusWorkflowOrder
): void {
  if (
    order.checkoutStatus !==
    "confirmed"
  ) {
    throw new OrderStatusServiceError(
      "PAYMENT_NOT_CONFIRMED",
      "This order has not completed checkout."
    );
  }

  if (
    order.payment?.status !== "paid"
  ) {
    throw new OrderStatusServiceError(
      "PAYMENT_NOT_CONFIRMED",
      "This order has not been confirmed as paid."
    );
  }
}


/*
|--------------------------------------------------------------------------
| Update Store Order Status
|--------------------------------------------------------------------------
|
| Firestore transaction behavior:
|
| 1. Read the current trusted order.
| 2. Verify ownership and payment.
| 3. Validate the current state.
| 4. Apply exactly one valid transition.
| 5. Return whether Shipday should be considered after commit.
|
*/

async function updateStoreOrderStatus(
  input: UpdateStoreOrderStatusInput
): Promise<UpdateStoreOrderStatusResult> {
  const requesterUid =
    normalizeRequiredString(
      input.requesterUid,
      "Requester UID"
    );

  const orderId =
    normalizeRequiredString(
      input.orderId,
      "Order ID"
    );

  if (
    !isStoreControlledOrderStatus(
      input.newStatus
    )
  ) {
    throw new OrderStatusServiceError(
      "INVALID_REQUEST",
      "The requested order status is invalid."
    );
  }

  const newStatus =
    input.newStatus;

  const cancellationReason =
    normalizeCancellationReason(
      newStatus,
      input.cancellationReason
    );

  const orderReference =
    db
      .collection("orders")
      .doc(orderId);

  return db.runTransaction(
    async (
      transaction
    ): Promise<UpdateStoreOrderStatusResult> => {
      const orderSnapshot =
        await transaction.get(
          orderReference
        );

      if (!orderSnapshot.exists) {
        throw new OrderStatusServiceError(
          "ORDER_NOT_FOUND",
          "The order could not be found."
        );
      }

      const order =
        orderSnapshot.data() as
          StatusWorkflowOrder;

      const storeOwnerUid =
        typeof order.store?.ownerId ===
        "string"
          ? order.store.ownerId.trim()
          : "";

      const orderStoreId = typeof order.store?.id === "string" ? order.store.id.trim() : "";
      const authorizedStoreId = input.authorizedStoreId?.trim() ?? "";
      if (!storeOwnerUid || (authorizedStoreId ? orderStoreId !== authorizedStoreId : storeOwnerUid !== requesterUid)) {
        throw new OrderStatusServiceError(
          "FORBIDDEN",
          "You are not authorized to update this order."
        );
      }

      assertOrderIsConfirmed(
        order
      );

      if (
        !isBackendOrderStatus(
          order.status
        )
      ) {
        throw new OrderStatusServiceError(
          "INVALID_CURRENT_STATUS",
          "The order has an invalid current status."
        );
      }

      const previousStatus =
        order.status;
      const fulfillmentType = order.fulfillmentType === "pickup" ? "pickup" : "delivery";

      const orderNumber =
        typeof order.orderNumber ===
          "string" &&
        order.orderNumber.trim()
          ? order.orderNumber.trim()
          : orderSnapshot.id;

      /*
        An identical retry is treated as an idempotent success.

        It does not append another history entry and does not tell the
        caller that ready_for_pickup was newly reached.
      */
      if (
        previousStatus ===
        newStatus
      ) {
        return {
          fulfillmentType,
          orderId:
            orderSnapshot.id,

          orderNumber,

          previousStatus,

          currentStatus:
            previousStatus,

          changedAt:
            new Date().toISOString(),

          changed:
            false,

          newlyReadyForPickup:
            false,
        };
      }

      if (
        !isAllowedStoreOrderTransition(
          previousStatus,
          newStatus
        )
      ) {
        throw new OrderStatusServiceError(
          "INVALID_TRANSITION",
          `The order cannot move from ${previousStatus} to ${newStatus}.`
        );
      }

      const changedAt =
        Timestamp.now();

      const updateData:
        UpdateData<DocumentData> = {
          status:
            newStatus,

          updatedAt:
            FieldValue.serverTimestamp(),

          statusHistory:
            FieldValue.arrayUnion({
              status:
                newStatus,

              timestamp:
                changedAt,

              note:
                buildStatusNote(
                  newStatus,
                  cancellationReason,
                  fulfillmentType,
                ),

              changedBy: {
                uid:
                  requesterUid,

                actorType:
                  "store",
              },
            }),
        };

      if (
        newStatus === "cancelled"
      ) {
        updateData.cancellationReason =
          cancellationReason;
      }

      transaction.update(
        orderReference,
        updateData
      );

      return {
        fulfillmentType,
        orderId:
          orderSnapshot.id,

        orderNumber,

        previousStatus,

        currentStatus:
          newStatus,

        changedAt:
          changedAt
            .toDate()
            .toISOString(),

        changed:
          true,

        newlyReadyForPickup:
          newStatus ===
            "ready_for_pickup",
      };
    }
  );
}


/*
|--------------------------------------------------------------------------
| Error Guard
|--------------------------------------------------------------------------
*/

export function isOrderStatusServiceError(
  error: unknown
): error is OrderStatusServiceError {
  return (
    error instanceof
    OrderStatusServiceError
  );
}


/*
|--------------------------------------------------------------------------
| Shared Service
|--------------------------------------------------------------------------
*/

export const orderStatusService = {
  updateStoreOrderStatus,
};

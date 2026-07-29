/*
|--------------------------------------------------------------------------
| Update Order Status Callable
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Provides the single protected backend entry point for store-controlled
| fulfillment status updates.
|
| The frontend may request a status change, but it cannot:
|
| • Update Firestore directly
| • Skip required workflow steps
| • Change another store's order
| • Start fulfillment for an unpaid order
| • Mark an order out for delivery
| • Mark an order completed
| • Decide whether Shipday should run
|
| Shipday rule:
|
| A Shipday delivery is created when the resulting order status is preparing.
|
| The Shipday fulfillment service is idempotent, so this callable may safely
| invoke it again when a preparing request is retried.
|
| Marking the Shipday delivery ready for pickup will be connected separately
| when the LIA order reaches ready_for_pickup.
|
*/

import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  isOrderStatusServiceError,
  orderStatusService,
} from "./orderStatusService";

import type {
  StoreControlledOrderStatus,
} from "./orderStatusService";

import {
  isShipdayFulfillmentError,
  shipdayFulfillmentService,
} from "./shipdayFulfillmentService";


/*
|--------------------------------------------------------------------------
| Callable Request
|--------------------------------------------------------------------------
*/

interface UpdateOrderStatusRequest {
  orderId?: unknown;

  newStatus?: unknown;

  cancellationReason?: unknown;
}


/*
|--------------------------------------------------------------------------
| Callable Response
|--------------------------------------------------------------------------
*/

interface UpdateOrderStatusResponse {
  success: true;

  orderId: string;

  orderNumber: string;

  previousStatus: string;

  currentStatus: string;

  changedAt: string;

  changed: boolean;

  newlyReadyForPickup: boolean;

  shipday: {
    attempted: boolean;

    created: boolean;

    orderId: string | null;

    message: string | null;
  };

  message: string;
}


/*
|--------------------------------------------------------------------------
| Request Guards
|--------------------------------------------------------------------------
*/

function isStoreControlledStatus(
  value: unknown
): value is StoreControlledOrderStatus {
  return (
    value === "accepted" ||
    value === "preparing" ||
    value === "ready_for_pickup" ||
    value === "cancelled"
  );
}


function readRequiredString(
  value: unknown,
  fieldName: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} is required.`
    );
  }

  return value.trim();
}


function readOptionalString(
  value: unknown,
  fieldName: string
): string | undefined {
  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} must be a string.`
    );
  }

  const normalized =
    value.trim();

  return normalized || undefined;
}


/*
|--------------------------------------------------------------------------
| Order Status Error Mapping
|--------------------------------------------------------------------------
*/

function mapOrderStatusError(
  error: unknown
): never {
  if (
    !isOrderStatusServiceError(
      error
    )
  ) {
    console.error(
      "Unexpected order-status error:",
      error
    );

    throw new HttpsError(
      "internal",
      "The order status could not be updated."
    );
  }

  switch (error.code) {
    case "INVALID_REQUEST":
    case "INVALID_CURRENT_STATUS":
    case "CANCELLATION_REASON_REQUIRED":
      throw new HttpsError(
        "invalid-argument",
        error.message
      );

    case "ORDER_NOT_FOUND":
      throw new HttpsError(
        "not-found",
        error.message
      );

    case "FORBIDDEN":
      throw new HttpsError(
        "permission-denied",
        error.message
      );

    case "PAYMENT_NOT_CONFIRMED":
    case "INVALID_TRANSITION":
      throw new HttpsError(
        "failed-precondition",
        error.message
      );

    default: {
      const exhaustiveCheck:
        never = error.code;

      throw new HttpsError(
        "internal",
        `Unhandled order-status error: ${exhaustiveCheck}`
      );
    }
  }
}


/*
|--------------------------------------------------------------------------
| Shipday Error Mapping
|--------------------------------------------------------------------------
|
| The status may already be preparing when Shipday creation fails.
|
| Returning a callable error tells the frontend that delivery creation
| still needs attention. A retry remains safe because the fulfillment
| service owns the idempotency checks.
|
*/

function mapShipdayError(
  error: unknown
): never {
  if (
    !isShipdayFulfillmentError(
      error
    )
  ) {
    console.error(
      "Unexpected Shipday fulfillment error:",
      error
    );

    throw new HttpsError(
      "internal",
      "The order is preparing, but its Shipday delivery could not be created."
    );
  }

  switch (error.code) {
  case "INVALID_ORDER_ID":
    throw new HttpsError(
      "invalid-argument",
      error.message
    );

  case "ORDER_NOT_FOUND":
    throw new HttpsError(
      "not-found",
      error.message
    );

  case "CHECKOUT_NOT_CONFIRMED":
  case "PAYMENT_NOT_CONFIRMED":
  case "ORDER_NOT_PREPARING":
  case "ORDER_NOT_READY_FOR_PICKUP":
  case "SHIPDAY_ORDER_MISSING":
    throw new HttpsError(
      "failed-precondition",
      error.message
    );

  case "CREATION_IN_PROGRESS":
  case "READY_UPDATE_IN_PROGRESS":
    throw new HttpsError(
      "aborted",
      error.message
    );

  case "INVALID_SHIPDAY_RESPONSE":
  case "SHIPDAY_CREATE_FAILED":
    throw new HttpsError(
      "unavailable",
      `The order is preparing, but Shipday could not create the delivery: ${error.message}`
    );

  case "SHIPDAY_READY_UPDATE_FAILED":
    throw new HttpsError(
      "unavailable",
      `The order is ready for pickup, but Shipday could not be updated: ${error.message}`
    );

  default: {
    const exhaustiveCheck:
      never = error.code;

    throw new HttpsError(
      "internal",
      `Unhandled Shipday fulfillment error: ${exhaustiveCheck}`
    );
  }
}
}


/*
|--------------------------------------------------------------------------
| Callable Function
|--------------------------------------------------------------------------
*/

export const updateOrderStatus =
  onCall<
    UpdateOrderStatusRequest,
    Promise<UpdateOrderStatusResponse>
  >(
    {
      region:
        "us-central1",

      maxInstances:
        20,

      /*
        This callable creates the Shipday delivery when the resulting order
        status is preparing.

        A later step will mark the existing Shipday delivery ready for pickup
        when the order reaches ready_for_pickup.
      */
      secrets: [
        "SHIPDAY_API_KEY",
        "SHIPDAY_API_URL",
      ],
    },

    async (
      request
    ): Promise<UpdateOrderStatusResponse> => {
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "You must be logged in to update an order."
        );
      }

      const orderId =
        readRequiredString(
          request.data?.orderId,
          "Order ID"
        );

      const requestedStatus =
        request.data?.newStatus;

      if (
        !isStoreControlledStatus(
          requestedStatus
        )
      ) {
        throw new HttpsError(
          "invalid-argument",
          "The requested order status is invalid."
        );
      }

      const cancellationReason =
        readOptionalString(
          request.data
            ?.cancellationReason,
          "Cancellation reason"
        );

      let statusResult;

      try {
        statusResult =
          await orderStatusService
            .updateStoreOrderStatus({
              requesterUid:
                request.auth.uid,

              orderId,

              newStatus:
                requestedStatus,

              cancellationReason,
            });
      } catch (error: unknown) {
        return mapOrderStatusError(
          error
        );
      }

  /*
  Create the Shipday delivery whenever the resulting status is preparing.

  Do not restrict this to only newly changed orders.

  If Shipday creation previously failed after Firestore successfully moved
  the order to preparing, repeating the preparing request safely retries the
  idempotent Shipday creation service.
*/
if (
  statusResult.currentStatus ===
  "preparing"
) {
  try {
    const shipdayResult =
      await shipdayFulfillmentService
        .createShipdayFulfillment(
          statusResult.orderId
        );

    return {
      success:
        true,

      orderId:
        statusResult.orderId,

      orderNumber:
        statusResult.orderNumber,

      previousStatus:
        statusResult.previousStatus,

      currentStatus:
        statusResult.currentStatus,

      changedAt:
        statusResult.changedAt,

      changed:
        statusResult.changed,

      newlyReadyForPickup:
        statusResult
          .newlyReadyForPickup,

      shipday: {
        attempted:
          true,

        created:
          shipdayResult.created,

        orderId:
          shipdayResult
            .shipdayOrderId,

        message:
          shipdayResult.message,
      },

      message:
        statusResult.changed
          ? "The order is now preparing and its Shipday delivery was created."
          : "The order was already preparing and its Shipday delivery was verified.",
    };
  } catch (error: unknown) {
    return mapShipdayError(
      error
    );
  }
}

/*
|--------------------------------------------------------------------------
| Mark Shipday Delivery Ready for Pickup
|--------------------------------------------------------------------------
|
| Whenever the resulting LIA status is ready_for_pickup, update the existing
| Shipday delivery.
|
| We do not limit this to newly changed orders.
|
| If the Shipday request previously failed after Firestore successfully moved
| the order to ready_for_pickup, repeating the same request safely retries the
| idempotent ready-for-pickup service.
|
*/

if (
  statusResult.currentStatus ===
  "ready_for_pickup"
) {
  try {
    const shipdayResult =
      await shipdayFulfillmentService
        .markShipdayReadyForPickup(
          statusResult.orderId
        );

    return {
      success:
        true,

      orderId:
        statusResult.orderId,

      orderNumber:
        statusResult.orderNumber,

      previousStatus:
        statusResult.previousStatus,

      currentStatus:
        statusResult.currentStatus,

      changedAt:
        statusResult.changedAt,

      changed:
        statusResult.changed,

      newlyReadyForPickup:
        statusResult
          .newlyReadyForPickup,

      shipday: {
        attempted:
          true,

        /*
          This response field originally described Shipday creation.

          For the ready-for-pickup workflow, no new delivery is created,
          so this remains false.
        */
        created:
          false,

        orderId:
          shipdayResult
            .shipdayOrderId,

        message:
          shipdayResult.message,
      },

      message:
        statusResult.changed
          ? "The order is ready for pickup and Shipday was updated."
          : shipdayResult.updated
            ? "The order was already ready for pickup and Shipday was updated."
            : "The order and its Shipday delivery were already ready for pickup.",
    };
  } catch (error: unknown) {
    return mapShipdayError(
      error
    );
  }
}

      return {
        success:
          true,

        orderId:
          statusResult.orderId,

        orderNumber:
          statusResult.orderNumber,

        previousStatus:
          statusResult.previousStatus,

        currentStatus:
          statusResult.currentStatus,

        changedAt:
          statusResult.changedAt,

        changed:
          statusResult.changed,

        newlyReadyForPickup:
          statusResult
            .newlyReadyForPickup,

        shipday: {
          attempted:
            false,

          created:
            false,

          orderId:
            null,

          message:
            null,
        },

        message:
          statusResult.changed
            ? "The order status was updated successfully."
            : "The order already has this status.",
      };
    }
  );
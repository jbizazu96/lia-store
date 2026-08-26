/*
|--------------------------------------------------------------------------
| Shipday Fulfillment Service
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Owns the protected Shipday fulfillment workflow for LIA orders.
|
| Workflow:
|
| preparing
|     ↓
| Create the Shipday delivery
|
| ready_for_pickup
|     ↓
| Mark the existing Shipday delivery ready for pickup
|
| This service guarantees:
|
| • Shipday is contacted only by the backend
| • A Shipday order is not created more than once
| • Ready-for-pickup updates are safely retryable
| • External HTTP requests never run inside Firestore transactions
|
*/

import {
  FieldValue,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";

import {
  mapOrderToShipday,
} from "../mappers/shipdayMapper";

import {
  shipdayService,
} from "../services/shipdayService";


const db =
  getFirestore("default");


/*
|--------------------------------------------------------------------------
| Firestore Order Shape
|--------------------------------------------------------------------------
*/

interface ShipdayFulfillmentOrder {
  fulfillmentType?: unknown;
  orderNumber?: unknown;

  status?: unknown;

  checkoutStatus?: unknown;

  payment?: {
    status?: unknown;
  };

  shipday?: {
    orderId?: unknown;

    status?: unknown;

    active?: unknown;

    creationAttemptId?: unknown;

    creationStartedAt?: unknown;

    readyToPickup?: unknown;

    readyUpdateStatus?: unknown;

    readyUpdateAttemptId?: unknown;

    readyUpdateStartedAt?: unknown;
  };

  [key: string]: unknown;
}


/*
|--------------------------------------------------------------------------
| Shipday Creation Response
|--------------------------------------------------------------------------
*/

interface ShipdayCreationResponse {
  orderId?: string | number;

  trackingUrl?: string;

  driverName?: string;

  driverPhone?: string;

  eta?: string;

  [key: string]: unknown;
}


/*
|--------------------------------------------------------------------------
| Public Results
|--------------------------------------------------------------------------
*/

export interface CreateShipdayFulfillmentResult {
  orderId: string;

  orderNumber: string;

  created: boolean;

  shipdayOrderId: string | null;

  message: string;
}


export interface MarkShipdayReadyResult {
  orderId: string;

  orderNumber: string;

  shipdayOrderId: string;

  updated: boolean;

  message: string;
}


/*
|--------------------------------------------------------------------------
| Error Model
|--------------------------------------------------------------------------
*/

export type ShipdayFulfillmentErrorCode =
  | "INVALID_ORDER_ID"
  | "ORDER_NOT_FOUND"
  | "CHECKOUT_NOT_CONFIRMED"
  | "PAYMENT_NOT_CONFIRMED"
  | "PICKUP_ORDER_NOT_SUPPORTED"
  | "ORDER_NOT_PREPARING"
  | "CREATION_IN_PROGRESS"
  | "INVALID_SHIPDAY_RESPONSE"
  | "SHIPDAY_CREATE_FAILED"
  | "SHIPDAY_ORDER_MISSING"
  | "ORDER_NOT_READY_FOR_PICKUP"
  | "READY_UPDATE_IN_PROGRESS"
  | "SHIPDAY_READY_UPDATE_FAILED";


export class ShipdayFulfillmentError extends Error {
  readonly code:
    ShipdayFulfillmentErrorCode;

  constructor(
    code: ShipdayFulfillmentErrorCode,
    message: string
  ) {
    super(message);

    this.name =
      "ShipdayFulfillmentError";

    this.code =
      code;
  }
}


/*
|--------------------------------------------------------------------------
| Internal Claim Results
|--------------------------------------------------------------------------
*/

interface ShipdayCreationClaim {
  orderId: string;

  orderNumber: string;

  attemptId: string;

  shouldCreate: boolean;

  existingShipdayOrderId:
    string | null;

  order:
    ShipdayFulfillmentOrder;
}


interface ShipdayReadyUpdateClaim {
  orderId: string;

  orderNumber: string;

  shipdayOrderId: string;

  attemptId: string;

  shouldUpdate: boolean;
}


/*
|--------------------------------------------------------------------------
| Claim Timeouts
|--------------------------------------------------------------------------
|
| If a function claims an operation and crashes before completion, another
| request may reclaim the operation after five minutes.
|
*/

const CREATION_CLAIM_TIMEOUT_MS =
  5 * 60 * 1000;

const READY_UPDATE_CLAIM_TIMEOUT_MS =
  5 * 60 * 1000;


/*
|--------------------------------------------------------------------------
| Shared Helpers
|--------------------------------------------------------------------------
*/

function normalizeOrderId(
  orderId: string
): string {
  const normalized =
    orderId.trim();

  if (!normalized) {
    throw new ShipdayFulfillmentError(
      "INVALID_ORDER_ID",
      "An order ID is required."
    );
  }

  return normalized;
}


function readString(
  value: unknown
): string | null {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return null;
  }

  return value.trim();
}


function readShipdayOrderId(
  value: unknown
): string | null {
  if (
    typeof value === "string" &&
    value.trim()
  ) {
    return value.trim();
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return String(value);
  }

  return null;
}


function timestampToMilliseconds(
  value: unknown
): number | null {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }

  return null;
}


function createAttemptId(): string {
  return db
    .collection("_shipdayAttempts")
    .doc()
    .id;
}


/*
|--------------------------------------------------------------------------
| Shared Order Guards
|--------------------------------------------------------------------------
*/

function assertConfirmedAndPaid(
  order: ShipdayFulfillmentOrder
): void {
  if (
    order.checkoutStatus !==
    "confirmed"
  ) {
    throw new ShipdayFulfillmentError(
      "CHECKOUT_NOT_CONFIRMED",
      "The order checkout has not been confirmed."
    );
  }

  if (
    order.payment?.status !==
    "paid"
  ) {
    throw new ShipdayFulfillmentError(
      "PAYMENT_NOT_CONFIRMED",
      "The order has not been confirmed as paid."
    );
  }
}


function assertOrderCanCreateShipday(
  order: ShipdayFulfillmentOrder
): void {
  assertConfirmedAndPaid(
    order
  );

  if (order.fulfillmentType === "pickup") {
    throw new ShipdayFulfillmentError(
      "PICKUP_ORDER_NOT_SUPPORTED",
      "Customer pickup orders must never be sent to Shipday.",
    );
  }

  if (
    order.status !==
    "preparing"
  ) {
    throw new ShipdayFulfillmentError(
      "ORDER_NOT_PREPARING",
      "The order must be preparing before its Shipday delivery can be created."
    );
  }
}


function assertOrderCanMarkShipdayReady(
  order: ShipdayFulfillmentOrder
): void {
  assertConfirmedAndPaid(
    order
  );

  if (order.fulfillmentType === "pickup") {
    throw new ShipdayFulfillmentError(
      "PICKUP_ORDER_NOT_SUPPORTED",
      "Customer pickup orders must never be sent to Shipday.",
    );
  }

  if (
    order.status !==
    "ready_for_pickup"
  ) {
    throw new ShipdayFulfillmentError(
      "ORDER_NOT_READY_FOR_PICKUP",
      "The order must be ready for pickup before Shipday can be updated."
    );
  }
}


/*
|--------------------------------------------------------------------------
| Claim Shipday Creation
|--------------------------------------------------------------------------
*/

async function claimShipdayCreation(
  orderId: string
): Promise<ShipdayCreationClaim> {
  const orderReference =
    db
      .collection("orders")
      .doc(orderId);

  return db.runTransaction(
    async (
      transaction
    ): Promise<ShipdayCreationClaim> => {
      const orderSnapshot =
        await transaction.get(
          orderReference
        );

      if (!orderSnapshot.exists) {
        throw new ShipdayFulfillmentError(
          "ORDER_NOT_FOUND",
          "The order could not be found."
        );
      }

      const order =
        orderSnapshot.data() as
          ShipdayFulfillmentOrder;

      assertOrderCanCreateShipday(
        order
      );

      const orderNumber =
        readString(
          order.orderNumber
        ) ?? orderSnapshot.id;

      const existingShipdayOrderId =
        readShipdayOrderId(
          order.shipday?.orderId
        );

      if (existingShipdayOrderId) {
        return {
          orderId:
            orderSnapshot.id,

          orderNumber,

          attemptId:
            "",

          shouldCreate:
            false,

          existingShipdayOrderId,

          order,
        };
      }

      const shipdayStatus =
        readString(
          order.shipday?.status
        );

      const creationStartedAtMs =
        timestampToMilliseconds(
          order.shipday
            ?.creationStartedAt
        );

      const activeClaimIsFresh =
        shipdayStatus ===
          "creating" &&
        creationStartedAtMs !==
          null &&
        Date.now() -
          creationStartedAtMs <
          CREATION_CLAIM_TIMEOUT_MS;

      if (activeClaimIsFresh) {
        throw new ShipdayFulfillmentError(
          "CREATION_IN_PROGRESS",
          "Shipday delivery creation is already in progress."
        );
      }

      const attemptId =
        createAttemptId();

      transaction.update(
        orderReference,
        {
          "shipday.status":
            "creating",

          "shipday.active":
            false,

          "shipday.creationAttemptId":
            attemptId,

          "shipday.creationStartedAt":
            FieldValue.serverTimestamp(),

          "shipday.lastError":
            FieldValue.delete(),

          updatedAt:
            FieldValue.serverTimestamp(),
        }
      );

      return {
        orderId:
          orderSnapshot.id,

        orderNumber,

        attemptId,

        shouldCreate:
          true,

        existingShipdayOrderId:
          null,

        order: {
          ...order,

          id:
            orderSnapshot.id,
        },
      };
    }
  );
}


/*
|--------------------------------------------------------------------------
| Complete Shipday Creation
|--------------------------------------------------------------------------
*/

async function completeShipdayCreation(
  orderId: string,
  attemptId: string,
  response: ShipdayCreationResponse
): Promise<string> {
  const shipdayOrderId =
    readShipdayOrderId(
      response.orderId
    );

  if (!shipdayOrderId) {
    throw new ShipdayFulfillmentError(
      "INVALID_SHIPDAY_RESPONSE",
      "Shipday did not return a valid order ID."
    );
  }

  const orderReference =
    db
      .collection("orders")
      .doc(orderId);

  await db.runTransaction(
    async (
      transaction
    ): Promise<void> => {
      const orderSnapshot =
        await transaction.get(
          orderReference
        );

      if (!orderSnapshot.exists) {
        throw new ShipdayFulfillmentError(
          "ORDER_NOT_FOUND",
          "The order could not be found after Shipday creation."
        );
      }

      const order =
        orderSnapshot.data() as
          ShipdayFulfillmentOrder;

      const currentAttemptId =
        readString(
          order.shipday
            ?.creationAttemptId
        );

      if (
        currentAttemptId !==
        attemptId
      ) {
        throw new ShipdayFulfillmentError(
          "SHIPDAY_CREATE_FAILED",
          "The Shipday creation attempt is no longer current."
        );
      }

      transaction.update(
        orderReference,
        {
          "shipday.orderId":
            shipdayOrderId,

          "shipday.status":
            "created",

          "shipday.active":
            true,

          "shipday.createdAt":
            FieldValue.serverTimestamp(),

          "shipday.lastUpdated":
            FieldValue.serverTimestamp(),

          "shipday.lastSyncAt":
            FieldValue.serverTimestamp(),

          "shipday.trackingUrl":
            response.trackingUrl ??
            null,

          "shipday.driverName":
            response.driverName ??
            null,

          "shipday.driverPhone":
            response.driverPhone ??
            null,

          "shipday.eta":
            response.eta ??
            null,

          "shipday.readyToPickup":
            false,

          "shipday.creationCompletedAt":
            FieldValue.serverTimestamp(),

          "shipday.lastError":
            FieldValue.delete(),

          updatedAt:
            FieldValue.serverTimestamp(),
        }
      );
    }
  );

  return shipdayOrderId;
}


/*
|--------------------------------------------------------------------------
| Record Shipday Creation Failure
|--------------------------------------------------------------------------
*/

async function recordShipdayCreationFailure(
  orderId: string,
  attemptId: string,
  error: unknown
): Promise<void> {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown Shipday creation error.";

  const orderReference =
    db
      .collection("orders")
      .doc(orderId);

  try {
    await db.runTransaction(
      async (
        transaction
      ): Promise<void> => {
        const orderSnapshot =
          await transaction.get(
            orderReference
          );

        if (!orderSnapshot.exists) {
          return;
        }

        const order =
          orderSnapshot.data() as
            ShipdayFulfillmentOrder;

        const currentAttemptId =
          readString(
            order.shipday
              ?.creationAttemptId
          );

        if (
          currentAttemptId !==
            attemptId ||
          readShipdayOrderId(
            order.shipday?.orderId
          )
        ) {
          return;
        }

        transaction.update(
          orderReference,
          {
            "shipday.status":
              "creation_failed",

            "shipday.active":
              false,

            "shipday.lastError":
              message.slice(
                0,
                1_000
              ),

            "shipday.lastFailureAt":
              FieldValue.serverTimestamp(),

            updatedAt:
              FieldValue.serverTimestamp(),
          }
        );
      }
    );
  } catch (recordError: unknown) {
    console.error(
      "Unable to record Shipday creation failure:",
      {
        orderId,
        attemptId,
        recordError,
      }
    );
  }
}


/*
|--------------------------------------------------------------------------
| Create Shipday Fulfillment
|--------------------------------------------------------------------------
*/

async function createShipdayFulfillment(
  rawOrderId: string
): Promise<CreateShipdayFulfillmentResult> {
  const orderId =
    normalizeOrderId(
      rawOrderId
    );

  const claim =
    await claimShipdayCreation(
      orderId
    );

  if (!claim.shouldCreate) {
    return {
      orderId:
        claim.orderId,

      orderNumber:
        claim.orderNumber,

      created:
        false,

      shipdayOrderId:
        claim.existingShipdayOrderId,

      message:
        "The Shipday delivery already exists.",
    };
  }

  try {
    const shipdayOrder =
      mapOrderToShipday({
        id:
          claim.orderId,

        ...claim.order,
      });

    const rawResponse =
      await shipdayService
        .createOrder(
          shipdayOrder
        );

    const response =
      rawResponse as
        ShipdayCreationResponse;

    const shipdayOrderId =
      await completeShipdayCreation(
        claim.orderId,
        claim.attemptId,
        response
      );

    return {
      orderId:
        claim.orderId,

      orderNumber:
        claim.orderNumber,

      created:
        true,

      shipdayOrderId,

      message:
        "The Shipday delivery was created successfully.",
    };
  } catch (error: unknown) {
    await recordShipdayCreationFailure(
      claim.orderId,
      claim.attemptId,
      error
    );

    if (
      error instanceof
      ShipdayFulfillmentError
    ) {
      throw error;
    }

    console.error(
      "Shipday fulfillment creation failed:",
      {
        orderId:
          claim.orderId,

        orderNumber:
          claim.orderNumber,

        attemptId:
          claim.attemptId,

        error,
      }
    );

    throw new ShipdayFulfillmentError(
      "SHIPDAY_CREATE_FAILED",
      error instanceof Error
        ? error.message
        : "The Shipday delivery could not be created."
    );
  }
}


/*
|--------------------------------------------------------------------------
| Claim Shipday Ready-for-Pickup Update
|--------------------------------------------------------------------------
*/

async function claimShipdayReadyUpdate(
  orderId: string
): Promise<ShipdayReadyUpdateClaim> {
  const orderReference =
    db
      .collection("orders")
      .doc(orderId);

  return db.runTransaction(
    async (
      transaction
    ): Promise<ShipdayReadyUpdateClaim> => {
      const orderSnapshot =
        await transaction.get(
          orderReference
        );

      if (!orderSnapshot.exists) {
        throw new ShipdayFulfillmentError(
          "ORDER_NOT_FOUND",
          "The order could not be found."
        );
      }

      const order =
        orderSnapshot.data() as
          ShipdayFulfillmentOrder;

      assertOrderCanMarkShipdayReady(
        order
      );

      const orderNumber =
        readString(
          order.orderNumber
        ) ?? orderSnapshot.id;

      const shipdayOrderId =
        readShipdayOrderId(
          order.shipday?.orderId
        );

      if (!shipdayOrderId) {
        throw new ShipdayFulfillmentError(
          "SHIPDAY_ORDER_MISSING",
          "The order does not have a Shipday delivery."
        );
      }

      if (
        order.shipday
          ?.readyToPickup ===
        true
      ) {
        return {
          orderId:
            orderSnapshot.id,

          orderNumber,

          shipdayOrderId,

          attemptId:
            "",

          shouldUpdate:
            false,
        };
      }

      const readyUpdateStatus =
        readString(
          order.shipday
            ?.readyUpdateStatus
        );

      const readyUpdateStartedAtMs =
        timestampToMilliseconds(
          order.shipday
            ?.readyUpdateStartedAt
        );

      const activeClaimIsFresh =
        readyUpdateStatus ===
          "updating" &&
        readyUpdateStartedAtMs !==
          null &&
        Date.now() -
          readyUpdateStartedAtMs <
          READY_UPDATE_CLAIM_TIMEOUT_MS;

      if (activeClaimIsFresh) {
        throw new ShipdayFulfillmentError(
          "READY_UPDATE_IN_PROGRESS",
          "The Shipday ready-for-pickup update is already in progress."
        );
      }

      const attemptId =
        createAttemptId();

      transaction.update(
        orderReference,
        {
          "shipday.readyUpdateStatus":
            "updating",

          "shipday.readyUpdateAttemptId":
            attemptId,

          "shipday.readyUpdateStartedAt":
            FieldValue.serverTimestamp(),

          "shipday.readyUpdateLastError":
            FieldValue.delete(),

          updatedAt:
            FieldValue.serverTimestamp(),
        }
      );

      return {
        orderId:
          orderSnapshot.id,

        orderNumber,

        shipdayOrderId,

        attemptId,

        shouldUpdate:
          true,
      };
    }
  );
}


/*
|--------------------------------------------------------------------------
| Complete Shipday Ready-for-Pickup Update
|--------------------------------------------------------------------------
*/

async function completeShipdayReadyUpdate(
  orderId: string,
  attemptId: string
): Promise<void> {
  const orderReference =
    db
      .collection("orders")
      .doc(orderId);

  await db.runTransaction(
    async (
      transaction
    ): Promise<void> => {
      const orderSnapshot =
        await transaction.get(
          orderReference
        );

      if (!orderSnapshot.exists) {
        throw new ShipdayFulfillmentError(
          "ORDER_NOT_FOUND",
          "The order could not be found after the Shipday update."
        );
      }

      const order =
        orderSnapshot.data() as
          ShipdayFulfillmentOrder;

      const currentAttemptId =
        readString(
          order.shipday
            ?.readyUpdateAttemptId
        );

      if (
        currentAttemptId !==
        attemptId
      ) {
        throw new ShipdayFulfillmentError(
          "SHIPDAY_READY_UPDATE_FAILED",
          "The Shipday ready-for-pickup attempt is no longer current."
        );
      }

      transaction.update(
        orderReference,
        {
          "shipday.readyToPickup":
            true,

          "shipday.readyUpdateStatus":
            "completed",

          "shipday.readyForPickupAt":
            FieldValue.serverTimestamp(),

          "shipday.lastUpdated":
            FieldValue.serverTimestamp(),

          "shipday.lastSyncAt":
            FieldValue.serverTimestamp(),

          "shipday.readyUpdateLastError":
            FieldValue.delete(),

          updatedAt:
            FieldValue.serverTimestamp(),
        }
      );
    }
  );
}


/*
|--------------------------------------------------------------------------
| Record Shipday Ready-for-Pickup Failure
|--------------------------------------------------------------------------
*/

async function recordShipdayReadyUpdateFailure(
  orderId: string,
  attemptId: string,
  error: unknown
): Promise<void> {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown Shipday ready-for-pickup error.";

  const orderReference =
    db
      .collection("orders")
      .doc(orderId);

  try {
    await db.runTransaction(
      async (
        transaction
      ): Promise<void> => {
        const orderSnapshot =
          await transaction.get(
            orderReference
          );

        if (!orderSnapshot.exists) {
          return;
        }

        const order =
          orderSnapshot.data() as
            ShipdayFulfillmentOrder;

        const currentAttemptId =
          readString(
            order.shipday
              ?.readyUpdateAttemptId
          );

        if (
          currentAttemptId !==
            attemptId ||
          order.shipday
            ?.readyToPickup ===
            true
        ) {
          return;
        }

        transaction.update(
          orderReference,
          {
            "shipday.readyUpdateStatus":
              "failed",

            "shipday.readyUpdateLastError":
              message.slice(
                0,
                1_000
              ),

            "shipday.readyUpdateFailureAt":
              FieldValue.serverTimestamp(),

            updatedAt:
              FieldValue.serverTimestamp(),
          }
        );
      }
    );
  } catch (recordError: unknown) {
    console.error(
      "Unable to record Shipday ready-for-pickup failure:",
      {
        orderId,
        attemptId,
        recordError,
      }
    );
  }
}


/*
|--------------------------------------------------------------------------
| Mark Shipday Order Ready for Pickup
|--------------------------------------------------------------------------
*/

async function markShipdayReadyForPickup(
  rawOrderId: string
): Promise<MarkShipdayReadyResult> {
  const orderId =
    normalizeOrderId(
      rawOrderId
    );

  const claim =
    await claimShipdayReadyUpdate(
      orderId
    );

  if (!claim.shouldUpdate) {
    return {
      orderId:
        claim.orderId,

      orderNumber:
        claim.orderNumber,

      shipdayOrderId:
        claim.shipdayOrderId,

      updated:
        false,

      message:
        "The Shipday delivery is already marked ready for pickup.",
    };
  }

  try {
    await shipdayService
      .markOrderReadyForPickup(
        claim.shipdayOrderId
      );

    await completeShipdayReadyUpdate(
      claim.orderId,
      claim.attemptId
    );

    return {
      orderId:
        claim.orderId,

      orderNumber:
        claim.orderNumber,

      shipdayOrderId:
        claim.shipdayOrderId,

      updated:
        true,

      message:
        "The Shipday delivery was marked ready for pickup.",
    };
  } catch (error: unknown) {
    await recordShipdayReadyUpdateFailure(
      claim.orderId,
      claim.attemptId,
      error
    );

    if (
      error instanceof
      ShipdayFulfillmentError
    ) {
      throw error;
    }

    console.error(
      "Shipday ready-for-pickup update failed:",
      {
        orderId:
          claim.orderId,

        orderNumber:
          claim.orderNumber,

        shipdayOrderId:
          claim.shipdayOrderId,

        attemptId:
          claim.attemptId,

        error,
      }
    );

    throw new ShipdayFulfillmentError(
      "SHIPDAY_READY_UPDATE_FAILED",
      error instanceof Error
        ? error.message
        : "The Shipday delivery could not be marked ready for pickup."
    );
  }
}


/*
|--------------------------------------------------------------------------
| Error Guard
|--------------------------------------------------------------------------
*/

export function isShipdayFulfillmentError(
  error: unknown
): error is ShipdayFulfillmentError {
  return (
    error instanceof
    ShipdayFulfillmentError
  );
}


/*
|--------------------------------------------------------------------------
| Shared Service
|--------------------------------------------------------------------------
*/

export const shipdayFulfillmentService = {
  createShipdayFulfillment,
  markShipdayReadyForPickup,
};

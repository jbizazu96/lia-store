/*
|--------------------------------------------------------------------------
| Checkout Session Service
|--------------------------------------------------------------------------
|
| Manages LIA's server-side checkout-session lifecycle.
|
| Responsibilities:
|
| - Generate a trusted checkout fingerprint
| - Find an existing reusable checkout session
| - Prevent duplicate active checkout sessions
| - Create and reserve a new checkout session
| - Store the related order and PaymentIntent references
| - Expire sessions that are no longer reusable
|
| Important:
|
| This is LIA's checkout-session system.
|
| It is separate from Stripe Customer Sessions.
|
| LIA checkout session:
|   Prevents duplicate orders and PaymentIntents.
|
| Stripe Customer Session:
|   Allows Stripe Elements to display and save payment methods.
*/

import {
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentData,
  type DocumentSnapshot,
  type Transaction,
} from "firebase-admin/firestore";

import {
  createCheckoutSessionFingerprint,
} from "./checkoutSessionFingerprint";

import type {
  CheckoutSessionFingerprintInput,
  CheckoutSessionResolution,
  CheckoutSessionStatus,
  ReusableCheckoutSession,
} from "./checkoutSessionTypes";


/*
|--------------------------------------------------------------------------
| Firestore
|--------------------------------------------------------------------------
*/

const db =
  getFirestore("default");


/*
|--------------------------------------------------------------------------
| Configuration
|--------------------------------------------------------------------------
*/

/*
  Active checkout sessions remain reusable for thirty minutes.

  This value will later move into admin-managed operational settings.
*/
const CHECKOUT_SESSION_DURATION_MINUTES =
  30;


/*
|--------------------------------------------------------------------------
| Inputs
|--------------------------------------------------------------------------
*/

export interface ResolveCheckoutSessionInput {
  fingerprintInput:
    CheckoutSessionFingerprintInput;
}


export interface AttachCheckoutSessionOrderInput {
  sessionId: string;

  orderId: string;

  orderNumber: string;
}


export interface AttachCheckoutSessionPaymentInput {
  sessionId: string;

  paymentIntentId: string;
}


/*
|--------------------------------------------------------------------------
| Errors
|--------------------------------------------------------------------------
*/

export type CheckoutSessionServiceErrorCode =
  | "INVALID_SESSION_ID"
  | "SESSION_NOT_FOUND"
  | "SESSION_PREPARATION_IN_PROGRESS"
  | "SESSION_NOT_PREPARING"
  | "SESSION_OWNERSHIP_MISMATCH"
  | "INVALID_ORDER_REFERENCE"
  | "INVALID_PAYMENT_INTENT"
  | "SESSION_CREATE_FAILED"
  | "SESSION_UPDATE_FAILED";


export class CheckoutSessionServiceError extends Error {
  readonly code:
    CheckoutSessionServiceErrorCode;

  constructor(
    code:
      CheckoutSessionServiceErrorCode,
    message: string
  ) {
    super(message);

    this.name =
      "CheckoutSessionServiceError";

    this.code =
      code;
  }
}


/*
|--------------------------------------------------------------------------
| Time Helpers
|--------------------------------------------------------------------------
*/

function createExpirationDate():
Date {
  return new Date(
    Date.now() +
    CHECKOUT_SESSION_DURATION_MINUTES *
    60 *
    1000
  );
}


function timestampToIso(
  value: unknown
): string | null {
  if (
    value instanceof
    Timestamp
  ) {
    return value
      .toDate()
      .toISOString();
  }

  if (
    value instanceof Date
  ) {
    return value
      .toISOString();
  }

  if (
    typeof value === "string"
  ) {
    const date =
      new Date(value);

    if (
      !Number.isNaN(
        date.getTime()
      )
    ) {
      return date.toISOString();
    }
  }

  return null;
}


/*
|--------------------------------------------------------------------------
| Session Status Helpers
|--------------------------------------------------------------------------
*/

function isReusableStatus(
  status: unknown
): status is
  | "awaiting_payment"
  | "processing" {
  return (
    status ===
      "awaiting_payment" ||
    status ===
      "processing"
  );
}


function isExpired(
  expiresAt: unknown
): boolean {
  const expirationIso =
    timestampToIso(
      expiresAt
    );

  if (!expirationIso) {
    return true;
  }

  return (
    new Date(
      expirationIso
    ).getTime() <=
    Date.now()
  );
}


/*
|--------------------------------------------------------------------------
| Reusable Session Mapping
|--------------------------------------------------------------------------
*/

function mapReusableSession(
  snapshot:
    DocumentSnapshot<DocumentData>
): ReusableCheckoutSession | null {
  if (!snapshot.exists) {
    return null;
  }

  const data =
    snapshot.data();

  if (!data) {
    return null;
  }

  if (
    !isReusableStatus(
      data.status
    ) ||
    isExpired(
      data.expiresAt
    )
  ) {
    return null;
  }

  const fingerprint =
    typeof data.fingerprint ===
      "string"
      ? data.fingerprint.trim()
      : "";

  const orderId =
    typeof data.orderId ===
      "string"
      ? data.orderId.trim()
      : "";

  const orderNumber =
    typeof data.orderNumber ===
      "string"
      ? data.orderNumber.trim()
      : "";

  const paymentIntentId =
    typeof data.paymentIntentId ===
      "string"
      ? data.paymentIntentId.trim()
      : "";

  const currency =
    data.currency === "usd"
      ? "usd"
      : null;

  const totalAmount =
    data.totalAmount;

  const expiresAt =
    timestampToIso(
      data.expiresAt
    );

  /*
    A session cannot be reused until both the order and PaymentIntent
    have been attached.
  */
  if (
    !fingerprint ||
    !orderId ||
    !orderNumber ||
    !paymentIntentId ||
    currency !== "usd" ||
    !Number.isSafeInteger(
      totalAmount
    ) ||
    totalAmount <= 0 ||
    !expiresAt
  ) {
    return null;
  }

  return {
    sessionId:
      snapshot.id,

    fingerprint,

    orderId,

    orderNumber,

    paymentIntentId,

    status:
      data.status,

    totalAmount,

    currency,

    expiresAt,
  };
}


/*
|--------------------------------------------------------------------------
| Expire Session
|--------------------------------------------------------------------------
*/

function expireInsideTransaction(
  transaction:
    Transaction,
  snapshot:
    DocumentSnapshot<DocumentData>
): void {
  if (!snapshot.exists) {
    return;
  }

  transaction.update(
    snapshot.ref,
    {
      status:
        "expired" satisfies
          CheckoutSessionStatus,

      expiredAt:
        FieldValue
          .serverTimestamp(),

      updatedAt:
        FieldValue
          .serverTimestamp(),
    }
  );
}


/*
|--------------------------------------------------------------------------
| Resolve Session
|--------------------------------------------------------------------------
*/

/*
  Resolve one checkout session using a deterministic document ID.

  Document ID:

  {customerUid}_{fingerprint}

  The customer UID is hashed inside the fingerprint input but remains in
  the session document for secure ownership queries and cleanup.

  Firestore transactions serialize concurrent writes to the same
  session document, preventing duplicate active sessions for the same
  customer and checkout configuration.
*/
async function resolveCheckoutSession(
  input:
    ResolveCheckoutSessionInput
): Promise<
  CheckoutSessionResolution
> {
  const fingerprint =
    createCheckoutSessionFingerprint(
      input.fingerprintInput
    );

  /*
    The fingerprint is already SHA-256 and safe for use in a Firestore
    document ID.

    Prefixing with the Firebase UID separates identical cart data across
    different customers.
  */
  const sessionDocumentId =
    `${input.fingerprintInput.customerUid}_${fingerprint}`;

  const sessionReference =
    db.collection(
      "checkoutSessions"
    ).doc(
      sessionDocumentId
    );

  try {
    return await db.runTransaction(
      async (
        transaction
      ): Promise<
        CheckoutSessionResolution
      > => {
        const sessionSnapshot =
          await transaction.get(
            sessionReference
          );

        /*
        |--------------------------------------------------------------------------
        | Reuse Existing Session
        |--------------------------------------------------------------------------
        */

        const reusableSession =
          mapReusableSession(
            sessionSnapshot
          );

        if (reusableSession) {
          transaction.update(
            sessionReference,
            {
              lastAccessedAt:
                FieldValue
                  .serverTimestamp(),

              updatedAt:
                FieldValue
                  .serverTimestamp(),
            }
          );

          return {
            type:
              "reuse",

            session:
              reusableSession,
          };
        }

        /*
        |--------------------------------------------------------------------------
        | Preparation Lock
        |--------------------------------------------------------------------------
        |
        | Another request may already be creating the order and PaymentIntent
        | for this exact checkout.
        |
        | Do not replace an active preparation lock. That could allow two
        | requests to create competing resources for the same session.
        |
        | A preparing session whose expiration time has passed may be replaced
        | because its original request is considered abandoned.
        */

        if (
        sessionSnapshot.exists &&
        sessionSnapshot.data()?.status ===
            "preparing" &&
        !isExpired(
            sessionSnapshot.data()
            ?.expiresAt
        )
        ) {
        throw new CheckoutSessionServiceError(
            "SESSION_PREPARATION_IN_PROGRESS",
            "This checkout is already being prepared. Please try again shortly."
        );
        }

        /*
          Expire an old or incomplete session before reserving a new
          checkout attempt.
        */
        if (
          sessionSnapshot.exists
        ) {
          expireInsideTransaction(
            transaction,
            sessionSnapshot
          );
        }

        const now =
          new Date();

        const expiresAt =
          createExpirationDate();

        /*
        |--------------------------------------------------------------------------
        | Reserve New Session
        |--------------------------------------------------------------------------
        |
        | The "preparing" state acts as a lock while the order and
        | PaymentIntent are being created.
        |
        */

        transaction.set(
          sessionReference,
          {
            fingerprint,

            customerUid:
              input.fingerprintInput
                .customerUid,

            storeId:
              input.fingerprintInput
                .storeId,

            status:
              "preparing" satisfies
                CheckoutSessionStatus,

            totalAmount:
              input.fingerprintInput
                .totalAmount,

            currency:
              input.fingerprintInput
                .currency,

            orderId:
              null,

            orderNumber:
              null,

            paymentIntentId:
              null,

            createdAt:
              Timestamp.fromDate(
                now
              ),

            updatedAt:
              Timestamp.fromDate(
                now
              ),

            lastAccessedAt:
              Timestamp.fromDate(
                now
              ),

            expiresAt:
              Timestamp.fromDate(
                expiresAt
              ),
          }
        );

        return {
          type:
            "create",

          session: {
            sessionId:
              sessionReference.id,

            fingerprint,

            expiresAt:
              expiresAt
                .toISOString(),
          },
        };
      }
    );
  } catch (
    error: unknown
  ) {
    if (
      error instanceof
      CheckoutSessionServiceError
    ) {
      throw error;
    }

    console.error(
      "Checkout session resolution failed:",
      {
        fingerprint,
        customerUid:
          input.fingerprintInput
            .customerUid,
        error,
      }
    );

    throw new CheckoutSessionServiceError(
      "SESSION_CREATE_FAILED",
      "The checkout session could not be prepared."
    );
  }
}


/*
|--------------------------------------------------------------------------
| Attach Order
|--------------------------------------------------------------------------
*/

/*
  Attach the Firestore order created for a reserved session.

  Only a session in the "preparing" state may receive its initial order
  reference.
*/
async function attachOrder(
  input:
    AttachCheckoutSessionOrderInput
): Promise<void> {
  const sessionId =
    input.sessionId.trim();

  const orderId =
    input.orderId.trim();

  const orderNumber =
    input.orderNumber.trim();

  if (!sessionId) {
    throw new CheckoutSessionServiceError(
      "INVALID_SESSION_ID",
      "A valid checkout session ID is required."
    );
  }

  if (
    !orderId ||
    !orderNumber
  ) {
    throw new CheckoutSessionServiceError(
      "INVALID_ORDER_REFERENCE",
      "A valid checkout order reference is required."
    );
  }

  const sessionReference =
    db.collection(
      "checkoutSessions"
    ).doc(
      sessionId
    );

  try {
    await db.runTransaction(
      async (
        transaction
      ) => {
        const snapshot =
          await transaction.get(
            sessionReference
          );

        if (!snapshot.exists) {
          throw new CheckoutSessionServiceError(
            "SESSION_NOT_FOUND",
            "The checkout session no longer exists."
          );
        }

        const data =
          snapshot.data() ?? {};

        if (
          data.status !==
          "preparing"
        ) {
          throw new CheckoutSessionServiceError(
            "SESSION_NOT_PREPARING",
            "The checkout session is not ready to receive an order."
          );
        }

        transaction.update(
          sessionReference,
          {
            orderId,

            orderNumber,

            updatedAt:
              FieldValue
                .serverTimestamp(),
          }
        );
      }
    );
  } catch (
    error: unknown
  ) {
    if (
      error instanceof
      CheckoutSessionServiceError
    ) {
      throw error;
    }

    console.error(
      "Unable to attach order to checkout session:",
      {
        sessionId,
        orderId,
        error,
      }
    );

    throw new CheckoutSessionServiceError(
      "SESSION_UPDATE_FAILED",
      "The checkout session order could not be saved."
    );
  }
}


/*
|--------------------------------------------------------------------------
| Attach PaymentIntent
|--------------------------------------------------------------------------
*/

/*
  Attach the Stripe PaymentIntent and make the session reusable.

  Once this succeeds, later identical checkout requests can safely reuse
  the existing order and PaymentIntent.
*/
async function attachPaymentIntent(
  input:
    AttachCheckoutSessionPaymentInput
): Promise<void> {
  const sessionId =
    input.sessionId.trim();

  const paymentIntentId =
    input.paymentIntentId.trim();

  if (!sessionId) {
    throw new CheckoutSessionServiceError(
      "INVALID_SESSION_ID",
      "A valid checkout session ID is required."
    );
  }

  if (
    !paymentIntentId ||
    !paymentIntentId.startsWith(
      "pi_"
    )
  ) {
    throw new CheckoutSessionServiceError(
      "INVALID_PAYMENT_INTENT",
      "A valid Stripe PaymentIntent ID is required."
    );
  }

  const sessionReference =
    db.collection(
      "checkoutSessions"
    ).doc(
      sessionId
    );

  try {
    await db.runTransaction(
      async (
        transaction
      ) => {
        const snapshot =
          await transaction.get(
            sessionReference
          );

        if (!snapshot.exists) {
          throw new CheckoutSessionServiceError(
            "SESSION_NOT_FOUND",
            "The checkout session no longer exists."
          );
        }

        const data =
          snapshot.data() ?? {};

        if (
          data.status !==
          "preparing"
        ) {
          throw new CheckoutSessionServiceError(
            "SESSION_NOT_PREPARING",
            "The checkout session cannot receive a PaymentIntent."
          );
        }

        if (
          typeof data.orderId !==
            "string" ||
          !data.orderId.trim() ||
          typeof data.orderNumber !==
            "string" ||
          !data.orderNumber.trim()
        ) {
          throw new CheckoutSessionServiceError(
            "INVALID_ORDER_REFERENCE",
            "The checkout session is missing its order reference."
          );
        }

        transaction.update(
          sessionReference,
          {
            paymentIntentId,

            status:
              "awaiting_payment" satisfies
                CheckoutSessionStatus,

            updatedAt:
              FieldValue
                .serverTimestamp(),
          }
        );
      }
    );
  } catch (
    error: unknown
  ) {
    if (
      error instanceof
      CheckoutSessionServiceError
    ) {
      throw error;
    }

    console.error(
      "Unable to attach PaymentIntent to checkout session:",
      {
        sessionId,
        paymentIntentId,
        error,
      }
    );

    throw new CheckoutSessionServiceError(
      "SESSION_UPDATE_FAILED",
      "The checkout session payment could not be saved."
    );
  }
}


/*
|--------------------------------------------------------------------------
| Mark Session Failed
|--------------------------------------------------------------------------
*/

/*
  Mark an incomplete session as failed when order or Stripe preparation
  cannot finish.

  A later identical checkout may replace this failed session.
*/
async function markSessionFailed(
  sessionId: string,
  reason: string
): Promise<void> {
  const normalizedSessionId =
    sessionId.trim();

  if (!normalizedSessionId) {
    return;
  }

  try {
    await db
      .collection(
        "checkoutSessions"
      )
      .doc(
        normalizedSessionId
      )
      .update({
        status:
          "payment_failed" satisfies
            CheckoutSessionStatus,

        failureReason:
          reason.slice(
            0,
            500
          ),

        failedAt:
          FieldValue
            .serverTimestamp(),

        updatedAt:
          FieldValue
            .serverTimestamp(),
      });
  } catch (
    error: unknown
  ) {
    console.error(
      "Unable to mark checkout session failed:",
      {
        sessionId:
          normalizedSessionId,
        error,
      }
    );
  }
}


/*
|--------------------------------------------------------------------------
| Type Guard
|--------------------------------------------------------------------------
*/

export function isCheckoutSessionServiceError(
  error: unknown
): error is CheckoutSessionServiceError {
  return (
    error instanceof
    CheckoutSessionServiceError
  );
}


/*
|--------------------------------------------------------------------------
| Service
|--------------------------------------------------------------------------
*/

export const checkoutSessionService = {
  resolveCheckoutSession,

  attachOrder,

  attachPaymentIntent,

  markSessionFailed,
};
/*
|--------------------------------------------------------------------------
| Checkout Session Fingerprint
|--------------------------------------------------------------------------
|
| Creates a stable SHA-256 fingerprint for one trusted checkout
| configuration.
|
| The fingerprint allows LIA to determine whether an existing active
| checkout session can be reused.
|
| Same checkout facts
|        ↓
| Same fingerprint
|        ↓
| Reuse existing order and PaymentIntent
|
| Material checkout change
|        ↓
| Different fingerprint
|        ↓
| Expire old checkout and create a new one
|
| This service is pure:
|
| - No Firestore reads
| - No Stripe calls
| - No Firebase Authentication
| - No browser state
*/

import {
  createHash,
} from "node:crypto";

import type {
  CheckoutSessionFingerprintInput,
} from "./checkoutSessionTypes";


/*
|--------------------------------------------------------------------------
| Normalized Shape
|--------------------------------------------------------------------------
|
| This internal model guarantees predictable key order and normalized
| string values before JSON serialization.
|
*/

interface NormalizedCheckoutFingerprint {
  customerUid: string;

  storeId: string;

  items: Array<{
    productId: string;

    quantity: number;

    size: {
      value: number;
      unit: string;
    } | null;
  }>;

  deliveryAddress: {
    street: string;

    city: string;

    state: string;

    zip: string;

    latitude: number;

    longitude: number;
  };

  tipAmount: number;

  totalAmount: number;

  currency: "usd";
}


/*
|--------------------------------------------------------------------------
| Errors
|--------------------------------------------------------------------------
*/

export type CheckoutSessionFingerprintErrorCode =
  | "INVALID_CUSTOMER_ID"
  | "INVALID_STORE_ID"
  | "INVALID_ITEMS"
  | "INVALID_ADDRESS"
  | "INVALID_TIP"
  | "INVALID_TOTAL";


export class CheckoutSessionFingerprintError extends Error {
  readonly code:
    CheckoutSessionFingerprintErrorCode;

  constructor(
    code:
      CheckoutSessionFingerprintErrorCode,
    message: string
  ) {
    super(message);

    this.name =
      "CheckoutSessionFingerprintError";

    this.code =
      code;
  }
}


/*
|--------------------------------------------------------------------------
| String Normalization
|--------------------------------------------------------------------------
*/

/*
  Normalize identifiers without changing case.

  Firestore document IDs and Firebase UIDs can be case-sensitive.
*/
function normalizeIdentifier(
  value: string,
  code: CheckoutSessionFingerprintErrorCode,
  message: string
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new CheckoutSessionFingerprintError(
      code,
      message
    );
  }

  return normalized;
}


/*
  Normalize human-entered address strings.

  Address casing and repeated whitespace should not create a different
  session when the geographic destination is otherwise unchanged.
*/
function normalizeAddressText(
  value: string,
  fieldName: string
): string {
  const normalized =
    value
      .trim()
      .replace(
        /\s+/g,
        " "
      )
      .toLowerCase();

  if (!normalized) {
    throw new CheckoutSessionFingerprintError(
      "INVALID_ADDRESS",
      `A valid delivery ${fieldName} is required.`
    );
  }

  return normalized;
}


/*
|--------------------------------------------------------------------------
| Money Validation
|--------------------------------------------------------------------------
*/

function requireCentAmount(
  value: number,
  code:
    | "INVALID_TIP"
    | "INVALID_TOTAL",
  fieldName: string,
  allowZero: boolean
): number {
  if (
    !Number.isSafeInteger(
      value
    ) ||
    value < 0 ||
    (
      !allowZero &&
      value === 0
    )
  ) {
    throw new CheckoutSessionFingerprintError(
      code,
      `${fieldName} must be a valid integer amount in cents.`
    );
  }

  return value;
}


/*
|--------------------------------------------------------------------------
| Coordinate Normalization
|--------------------------------------------------------------------------
*/

/*
  Round coordinates to six decimal places.

  Six decimal places are precise to roughly a fraction of a meter while
  preventing insignificant floating-point differences from creating a
  new checkout session.
*/
function normalizeCoordinate(
  value: number,
  type:
    | "latitude"
    | "longitude"
): number {
  const minimum =
    type === "latitude"
      ? -90
      : -180;

  const maximum =
    type === "latitude"
      ? 90
      : 180;

  if (
    !Number.isFinite(
      value
    ) ||
    value < minimum ||
    value > maximum
  ) {
    throw new CheckoutSessionFingerprintError(
      "INVALID_ADDRESS",
      `The delivery ${type} is invalid.`
    );
  }

  return Number(
    value.toFixed(
      6
    )
  );
}


/*
|--------------------------------------------------------------------------
| Item Normalization
|--------------------------------------------------------------------------
*/

function normalizeItems(
  items:
    CheckoutSessionFingerprintInput["items"]
): NormalizedCheckoutFingerprint["items"] {
  if (
    !Array.isArray(
      items
    ) ||
    items.length === 0
  ) {
    throw new CheckoutSessionFingerprintError(
      "INVALID_ITEMS",
      "Checkout must contain at least one product."
    );
  }

  const normalizedItems =
    items.map(
      (
        item
      ) => {
        const productId =
          normalizeIdentifier(
            item.productId,
            "INVALID_ITEMS",
            "Every checkout item must include a valid product ID."
          );

        if (
          !Number.isSafeInteger(
            item.quantity
          ) ||
          item.quantity <= 0
        ) {
          throw new CheckoutSessionFingerprintError(
            "INVALID_ITEMS",
            "Every checkout item must include a valid quantity."
          );
        }

        let normalizedSize:
          {
            value: number;
            unit: string;
          } | null = null;

        if (item.size) {
          if (
            !Number.isFinite(
              item.size.value
            ) ||
            item.size.value <= 0 ||
            !item.size.unit
              .trim()
          ) {
            throw new CheckoutSessionFingerprintError(
              "INVALID_ITEMS",
              "A selected product size is invalid."
            );
          }

          normalizedSize = {
            value:
              Number(
                item.size.value
                  .toFixed(4)
              ),

            unit:
              item.size.unit
                .trim()
                .toLowerCase(),
          };
        }

        return {
          productId,

          quantity:
            item.quantity,

          size:
            normalizedSize,
        };
      }
    );

  /*
    Sort items so cart ordering does not affect the fingerprint.

    Example:

    [productA, productB]

    and

    [productB, productA]

    represent the same checkout when quantities and sizes match.
  */
  normalizedItems.sort(
    (
      first,
      second
    ) => {
      const firstKey =
        [
          first.productId,
          first.size?.value ??
            "",
          first.size?.unit ??
            "",
        ].join("|");

      const secondKey =
        [
          second.productId,
          second.size?.value ??
            "",
          second.size?.unit ??
            "",
        ].join("|");

      return firstKey.localeCompare(
        secondKey
      );
    }
  );

  return normalizedItems;
}


/*
|--------------------------------------------------------------------------
| Normalize Fingerprint Input
|--------------------------------------------------------------------------
*/

function normalizeFingerprintInput(
  input:
    CheckoutSessionFingerprintInput
): NormalizedCheckoutFingerprint {
  const customerUid =
    normalizeIdentifier(
      input.customerUid,
      "INVALID_CUSTOMER_ID",
      "A valid authenticated customer ID is required."
    );

  const storeId =
    normalizeIdentifier(
      input.storeId,
      "INVALID_STORE_ID",
      "A valid store ID is required."
    );

  const latitude =
    normalizeCoordinate(
      input.deliveryAddress
        .latitude,
      "latitude"
    );

  const longitude =
    normalizeCoordinate(
      input.deliveryAddress
        .longitude,
      "longitude"
    );

  if (
    latitude === 0 &&
    longitude === 0
  ) {
    throw new CheckoutSessionFingerprintError(
      "INVALID_ADDRESS",
      "The delivery coordinates are invalid."
    );
  }

  return {
    customerUid,

    storeId,

    items:
      normalizeItems(
        input.items
      ),

    deliveryAddress: {
      street:
        normalizeAddressText(
          input.deliveryAddress
            .street,
          "street"
        ),

      city:
        normalizeAddressText(
          input.deliveryAddress
            .city,
          "city"
        ),

      state:
        normalizeAddressText(
          input.deliveryAddress
            .state,
          "state"
        ),

      zip:
        normalizeAddressText(
          input.deliveryAddress
            .zip,
          "ZIP code"
        ),

      latitude,

      longitude,
    },

    tipAmount:
      requireCentAmount(
        input.tipAmount,
        "INVALID_TIP",
        "Tip",
        true
      ),

    totalAmount:
      requireCentAmount(
        input.totalAmount,
        "INVALID_TOTAL",
        "Total",
        false
      ),

    currency:
      input.currency,
  };
}


/*
|--------------------------------------------------------------------------
| Create Fingerprint
|--------------------------------------------------------------------------
*/

/*
  Build a deterministic SHA-256 fingerprint.

  The result is safe to store in Firestore and use as a lookup key.

  It does not contain readable customer, address, or product data.
*/
export function createCheckoutSessionFingerprint(
  input:
    CheckoutSessionFingerprintInput
): string {
  const normalizedInput =
    normalizeFingerprintInput(
      input
    );

  const serializedInput =
    JSON.stringify(
      normalizedInput
    );

  return createHash(
    "sha256"
  )
    .update(
      serializedInput,
      "utf8"
    )
    .digest(
      "hex"
    );
}


/*
|--------------------------------------------------------------------------
| Type Guard
|--------------------------------------------------------------------------
*/

export function isCheckoutSessionFingerprintError(
  error: unknown
): error is CheckoutSessionFingerprintError {
  return (
    error instanceof
    CheckoutSessionFingerprintError
  );
}
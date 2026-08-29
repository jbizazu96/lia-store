/*
|--------------------------------------------------------------------------
| Checkout Payment Validation
|--------------------------------------------------------------------------
|
| Validates the untrusted payload received by the future
| prepareCheckoutPayment callable Firebase Function.
|
| Important:
|
| TypeScript interfaces provide compile-time safety only.
|
| A browser, script, or modified client can still send malformed runtime
| data. Therefore, every payment request must be validated before:
|
| - Reading Firestore
| - Calling Google Routes
| - Calculating pricing
| - Creating an order
| - Creating a Stripe PaymentIntent
*/

import type {
  CheckoutPaymentAddressInput,
  CheckoutPaymentItemInput,
  PrepareCheckoutPaymentRequest,
} from "./checkoutPaymentTypes";


/*
  Predictable validation codes that the callable function can translate
  into safe Firebase HttpsError responses.
*/
export type CheckoutPaymentValidationErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_FULFILLMENT_TYPE"
  | "INVALID_STORE_ID"
  | "INVALID_CONTACT_NAME"
  | "INVALID_CONTACT_PHONE"
  | "INVALID_ITEMS"
  | "INVALID_PRODUCT_ID"
  | "INVALID_QUANTITY"
  | "INVALID_SIZE"
  | "INVALID_DELIVERY_ADDRESS"
  | "INVALID_DELIVERY_COORDINATES"
  | "INVALID_DELIVERY_INSTRUCTIONS"
  | "INVALID_FULFILLMENT_TIME"
  | "INVALID_TIP";


/*
  Expected request-validation error.
*/
export class CheckoutPaymentValidationError extends Error {
  readonly code: CheckoutPaymentValidationErrorCode;

  constructor(
    code: CheckoutPaymentValidationErrorCode,
    message: string
  ) {
    super(message);

    this.name = "CheckoutPaymentValidationError";
    this.code = code;
  }
}


/*
  Confirm a value is a non-null object and not an array.
*/
function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}


/*
  Read and normalize a required string.
*/
function requireString(
  value: unknown,
  code: CheckoutPaymentValidationErrorCode,
  message: string
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new CheckoutPaymentValidationError(
      code,
      message
    );
  }

  return value.trim();
}


/*
  Read an optional string.

  Empty strings become undefined.
*/
function optionalString(
  value: unknown,
  code: CheckoutPaymentValidationErrorCode,
  message: string,
  maximumLength: number
): string | undefined {
  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new CheckoutPaymentValidationError(
      code,
      message
    );
  }

  const normalized =
    value.trim();

  if (!normalized) {
    return undefined;
  }

  if (
    normalized.length >
    maximumLength
  ) {
    throw new CheckoutPaymentValidationError(
      code,
      message
    );
  }

  return normalized;
}


/*
  Validate one optional product-size selection.
*/
function validateSize(
  value: unknown
): CheckoutPaymentItemInput["size"] {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (!isRecord(value)) {
    throw new CheckoutPaymentValidationError(
      "INVALID_SIZE",
      "The selected product size is invalid."
    );
  }

  const sizeValue =
    value.value;

  const unit =
    value.unit;

  if (
    typeof sizeValue !== "number" ||
    !Number.isFinite(sizeValue) ||
    sizeValue <= 0
  ) {
    throw new CheckoutPaymentValidationError(
      "INVALID_SIZE",
      "The selected product size value is invalid."
    );
  }

  if (
    typeof unit !== "string" ||
    unit.trim().length === 0 ||
    unit.trim().length > 20
  ) {
    throw new CheckoutPaymentValidationError(
      "INVALID_SIZE",
      "The selected product size unit is invalid."
    );
  }

  return {
    value: sizeValue,
    unit: unit.trim(),
  };
}


/*
  Validate one requested checkout item.
*/
function validateItem(
  value: unknown
): CheckoutPaymentItemInput {
  if (!isRecord(value)) {
    throw new CheckoutPaymentValidationError(
      "INVALID_ITEMS",
      "Every checkout item must be valid."
    );
  }

  const productId =
    requireString(
      value.productId,
      "INVALID_PRODUCT_ID",
      "Every checkout item must include a valid product ID."
    );

  const quantity =
    value.quantity;

  if (
    !Number.isSafeInteger(quantity) ||
    Number(quantity) <= 0
  ) {
    throw new CheckoutPaymentValidationError(
      "INVALID_QUANTITY",
      "Every checkout item must include a valid quantity."
    );
  }

  /*
    Prevent unreasonable payloads before Firestore is queried.

    Current product stock validation still happens against Firestore.
  */
  if (Number(quantity) > 999) {
    throw new CheckoutPaymentValidationError(
      "INVALID_QUANTITY",
      "The requested product quantity is too large."
    );
  }

  return {
    productId,
    quantity: Number(quantity),
    size: validateSize(
      value.size
    ),
  };
}


/*
  Validate optional geographic coordinates.

  The dedicated routing service performs the final geographic-range and
  0,0 checks. Here we ensure both coordinates are either supplied
  together or omitted together.
*/
function validateAddressCoordinates(
  latitudeValue: unknown,
  longitudeValue: unknown
): {
  latitude?: number;
  longitude?: number;
} {
  const latitudeMissing =
    latitudeValue === undefined ||
    latitudeValue === null;

  const longitudeMissing =
    longitudeValue === undefined ||
    longitudeValue === null;

  if (
    latitudeMissing &&
    longitudeMissing
  ) {
    return {};
  }

  if (
    latitudeMissing ||
    longitudeMissing ||
    typeof latitudeValue !== "number" ||
    typeof longitudeValue !== "number" ||
    !Number.isFinite(latitudeValue) ||
    !Number.isFinite(longitudeValue)
  ) {
    throw new CheckoutPaymentValidationError(
      "INVALID_DELIVERY_COORDINATES",
      "The delivery address must include valid map coordinates."
    );
  }

  return {
    latitude: latitudeValue,
    longitude: longitudeValue,
  };
}


/*
  Validate the customer delivery address.
*/
function validateDeliveryAddress(
  value: unknown
): CheckoutPaymentAddressInput {
  if (!isRecord(value)) {
    throw new CheckoutPaymentValidationError(
      "INVALID_DELIVERY_ADDRESS",
      "A valid delivery address is required."
    );
  }

  const street =
    requireString(
      value.street,
      "INVALID_DELIVERY_ADDRESS",
      "A valid street address is required."
    );

  const city =
    requireString(
      value.city,
      "INVALID_DELIVERY_ADDRESS",
      "A valid city is required."
    );

  const state =
    requireString(
      value.state,
      "INVALID_DELIVERY_ADDRESS",
      "A valid state is required."
    );

  const zip =
    requireString(
      value.zip,
      "INVALID_DELIVERY_ADDRESS",
      "A valid ZIP code is required."
    );

  if (
    street.length > 200 ||
    city.length > 100 ||
    state.length > 100 ||
    zip.length > 20
  ) {
    throw new CheckoutPaymentValidationError(
      "INVALID_DELIVERY_ADDRESS",
      "The delivery address contains an invalid value."
    );
  }

  const coordinates =
    validateAddressCoordinates(
      value.latitude,
      value.longitude
    );

  const formattedAddress =
    optionalString(
      value.formattedAddress,
      "INVALID_DELIVERY_ADDRESS",
      "The formatted delivery address is invalid.",
      300
    );

  return {
    street,
    city,
    state,
    zip,
    ...coordinates,
    formattedAddress,
  };
}


/*
  Validate the complete prepare-payment request.
*/
export function validatePrepareCheckoutPaymentRequest(
  value: unknown
): PrepareCheckoutPaymentRequest {
  if (!isRecord(value)) {
    throw new CheckoutPaymentValidationError(
      "INVALID_REQUEST",
      "The checkout request is invalid."
    );
  }

  const storeId =
    requireString(
      value.storeId,
      "INVALID_STORE_ID",
      "A valid store ID is required."
    );

  const fulfillmentType = value.fulfillmentType;
  if (fulfillmentType !== "delivery" && fulfillmentType !== "pickup") {
    throw new CheckoutPaymentValidationError(
      "INVALID_FULFILLMENT_TYPE",
      "Choose delivery or customer pickup."
    );
  }

    /*
|--------------------------------------------------------------------------
| Delivery Contact
|--------------------------------------------------------------------------
|
| The authenticated Firebase UID owns the order.
|
| These fields identify the person the store or driver should contact
| for this specific delivery.
|
*/

const contactName =
  requireString(
    value.contactName,
    "INVALID_CONTACT_NAME",
    "A valid delivery contact name is required."
  );

if (contactName.length > 100) {
  throw new CheckoutPaymentValidationError(
    "INVALID_CONTACT_NAME",
    "The delivery contact name must be 100 characters or fewer."
  );
}

const contactPhone =
  requireString(
    value.contactPhone,
    "INVALID_CONTACT_PHONE",
    "A valid delivery contact phone number is required."
  );

/*
  Keep common phone formatting characters while requiring a sensible
  number of actual digits.

  Examples accepted:

  (657) 567 - 4563
  657-567-4563
  +1 657 567 4563
*/
const contactPhoneDigits =
  contactPhone.replace(
    /\D/g,
    ""
  );

if (
  contactPhone.length > 30 ||
  contactPhoneDigits.length < 10 ||
  contactPhoneDigits.length > 15
) {
  throw new CheckoutPaymentValidationError(
    "INVALID_CONTACT_PHONE",
    "Enter a valid delivery contact phone number."
  );
}

  if (!Array.isArray(value.items)) {
    throw new CheckoutPaymentValidationError(
      "INVALID_ITEMS",
      "Checkout items are required."
    );
  }

  if (
    value.items.length === 0 ||
    value.items.length > 100
  ) {
    throw new CheckoutPaymentValidationError(
      "INVALID_ITEMS",
      "Checkout must contain between 1 and 100 products."
    );
  }

  const items =
    value.items.map(
      validateItem
    );

  const deliveryAddress = fulfillmentType === "delivery"
    ? validateDeliveryAddress(value.deliveryAddress)
    : undefined;

  const deliveryInstructions =
    optionalString(
      value.deliveryInstructions,
      "INVALID_DELIVERY_INSTRUCTIONS",
      "Delivery instructions must be 500 characters or fewer.",
      500
    );

  const pickupInstructions =
    optionalString(
      value.pickupInstructions,
      "INVALID_DELIVERY_INSTRUCTIONS",
      "Pickup instructions must be 500 characters or fewer.",
      500
    );

  const fulfillmentTiming = value.fulfillmentTiming === undefined ? "asap" : value.fulfillmentTiming;
  if (fulfillmentTiming !== "asap" && fulfillmentTiming !== "scheduled") {
    throw new CheckoutPaymentValidationError("INVALID_FULFILLMENT_TIME", "Choose ASAP or a scheduled fulfillment time.");
  }
  let scheduledWindow: PrepareCheckoutPaymentRequest["scheduledWindow"];
  if (fulfillmentTiming === "scheduled") {
    if (!isRecord(value.scheduledWindow)) throw new CheckoutPaymentValidationError("INVALID_FULFILLMENT_TIME", "Choose a scheduled fulfillment window.");
    const start = requireString(value.scheduledWindow.start, "INVALID_FULFILLMENT_TIME", "The scheduled start time is invalid.");
    const end = requireString(value.scheduledWindow.end, "INVALID_FULFILLMENT_TIME", "The scheduled end time is invalid.");
    const timezone = requireString(value.scheduledWindow.timezone, "INVALID_FULFILLMENT_TIME", "The store timezone is invalid.");
    if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end)) || start.length > 40 || end.length > 40 || timezone.length > 80) throw new CheckoutPaymentValidationError("INVALID_FULFILLMENT_TIME", "The scheduled fulfillment window is invalid.");
    scheduledWindow = {start: new Date(start).toISOString(), end: new Date(end).toISOString(), timezone};
  }

  const tipAmountCents =
    value.tipAmountCents;

  if (
    !Number.isSafeInteger(
      tipAmountCents
    ) ||
    Number(tipAmountCents) < 0
  ) {
    throw new CheckoutPaymentValidationError(
      "INVALID_TIP",
      "The selected tip amount is invalid."
    );
  }

  if (fulfillmentType === "pickup" && Number(tipAmountCents) !== 0) {
    throw new CheckoutPaymentValidationError(
      "INVALID_TIP",
      "Customer pickup orders cannot include a driver tip."
    );
  }

  /*
    MVP abuse protection.

    $500.00 is well above the normal driver-tip range while still
    allowing unusually generous legitimate tips.

    The future admin pricing configuration can replace this limit.
  */
  if (
    Number(tipAmountCents) >
    50_000
  ) {
    throw new CheckoutPaymentValidationError(
      "INVALID_TIP",
      "The selected tip amount is too large."
    );
  }

  return {
    storeId,

    fulfillmentType,

    contactName,

    contactPhone,

    items,

    deliveryAddress,

    deliveryInstructions,

    pickupInstructions,

    fulfillmentTiming,
    scheduledWindow,

    tipAmountCents:
        Number(tipAmountCents),
    };
}


/*
  Type guard used by the future callable function.
*/
export function isCheckoutPaymentValidationError(
  error: unknown
): error is CheckoutPaymentValidationError {
  return (
    error instanceof
    CheckoutPaymentValidationError
  );
}

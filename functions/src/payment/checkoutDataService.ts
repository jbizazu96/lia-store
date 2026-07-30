/*
|--------------------------------------------------------------------------
| Checkout Data Service
|--------------------------------------------------------------------------
|
| Loads and validates trusted checkout data from Firestore.
|
| Responsibilities:
|
| - Validate the requested store ID
| - Load the current store document
| - Verify the store is active
| - Verify Stripe payout readiness
| - Load every requested product
| - Verify products belong to the requested store
| - Verify products are available
| - Verify requested quantities
| - Verify sufficient stock
| - Build trusted product snapshots
| - Calculate the merchandise subtotal in integer cents
|
| This service does NOT:
|
| - Create a Stripe PaymentIntent
| - Create an order document
| - Reduce inventory
| - Notify the store
| - Create a Shipday delivery
|
| Inventory is checked here before payment creation and must be checked
| again when payment succeeds.
*/

import {
  getFirestore,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase-admin/firestore";

import type {
  CheckoutPaymentItemInput,
  TrustedCheckoutItem,
  TrustedCheckoutStore,
} from "./checkoutPaymentTypes";


/*
  LIA explicitly uses the Firestore database whose ID is "default".
*/
const db =
  getFirestore("default");


/*
  Predictable checkout validation codes.

  The future callable function can translate these into safe
  HttpsError responses.
*/
export type CheckoutDataErrorCode =
  | "INVALID_STORE_ID"
  | "STORE_NOT_FOUND"
  | "STORE_UNAVAILABLE"
  | "STORE_STRIPE_NOT_READY"
  | "INVALID_ITEMS"
  | "INVALID_PRODUCT_ID"
  | "INVALID_QUANTITY"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_STORE_MISMATCH"
  | "PRODUCT_UNAVAILABLE"
  | "INSUFFICIENT_STOCK"
  | "INVALID_PRODUCT_PRICE"
  | "INVALID_STORE_DATA";


/*
  Error used for expected checkout validation failures.
*/
export class CheckoutDataError extends Error {
  readonly code: CheckoutDataErrorCode;

  constructor(
    code: CheckoutDataErrorCode,
    message: string
  ) {
    super(message);

    this.name = "CheckoutDataError";
    this.code = code;
  }
}


/*
  Result returned after loading the trusted store and products.
*/
export interface TrustedCheckoutData {
  store: TrustedCheckoutStore;

  items: TrustedCheckoutItem[];

  /*
    Merchandise subtotal in integer cents.
  */
  subtotalAmount: number;
}


/*
  Safely read a required string from Firestore.
*/
function requireString(
  data: DocumentData,
  fieldName: string,
  errorMessage: string
): string {
  const value =
    data[fieldName];

  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new CheckoutDataError(
      "INVALID_STORE_DATA",
      errorMessage
    );
  }

  return value.trim();
}


/*
  Safely read a required finite number from Firestore.
*/
function requireNumber(
  data: DocumentData,
  fieldName: string,
  errorMessage: string
): number {
  const value =
    data[fieldName];

  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new CheckoutDataError(
      "INVALID_STORE_DATA",
      errorMessage
    );
  }

  return value;
}


/*
  Convert a trusted Firestore dollar value into integer cents.

  Example:

  4.99
      ↓
  499
*/
function dollarsToCents(
  value: unknown,
  productName: string
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new CheckoutDataError(
      "INVALID_PRODUCT_PRICE",
      `${productName} has an invalid price.`
    );
  }

  const amount =
    Math.round(value * 100);

  if (
    !Number.isSafeInteger(amount) ||
    amount < 0
  ) {
    throw new CheckoutDataError(
      "INVALID_PRODUCT_PRICE",
      `${productName} has an invalid price.`
    );
  }

  return amount;
}


/*
  Get the trusted discounted price from the product document.

  Cart prices are intentionally never trusted for payment. This mirrors the
  customer promotion rules while using the current Firestore product data.
*/
function getTrustedDiscountedUnitPriceAmount(
  price: number,
  promotion: unknown,
  originalUnitPriceAmount: number
): number {
  if (
    !promotion ||
    typeof promotion !== "object"
  ) {
    return originalUnitPriceAmount;
  }

  const data =
    promotion as Record<string, unknown>;

  if (
    data.type !== "discount" ||
    data.isActive === false
  ) {
    return originalUnitPriceAmount;
  }

  const now = Date.now();

  for (const fieldName of ["startsAt", "endsAt"] as const) {
    const value = data[fieldName];

    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value !== "string") {
      return originalUnitPriceAmount;
    }

    const time = Date.parse(value);

    if (
      Number.isNaN(time) ||
      (fieldName === "startsAt" && now < time) ||
      (fieldName === "endsAt" && now > time)
    ) {
      return originalUnitPriceAmount;
    }
  }

  let discountedPrice = price;

  if (
    typeof data.discountPercentage === "number" &&
    Number.isFinite(data.discountPercentage) &&
    data.discountPercentage > 0
  ) {
    discountedPrice =
      price *
      (1 - Math.min(data.discountPercentage, 100) / 100);
  } else if (
    typeof data.discountAmount === "number" &&
    Number.isFinite(data.discountAmount) &&
    data.discountAmount > 0
  ) {
    discountedPrice =
      price - data.discountAmount;
  }

  return Math.max(
    0,
    Math.round(discountedPrice * 100)
  );
}


/*
  Normalize and validate one customer product selection.
*/
function validateItemInput(
  item: CheckoutPaymentItemInput
): {
  productId: string;
  quantity: number;
  size?: {
    value: number;
    unit: string;
  } | null;
} {
  const productId =
    typeof item.productId === "string"
      ? item.productId.trim()
      : "";

  if (!productId) {
    throw new CheckoutDataError(
      "INVALID_PRODUCT_ID",
      "Every checkout item must include a valid product ID."
    );
  }

  if (
    !Number.isSafeInteger(item.quantity) ||
    item.quantity <= 0
  ) {
    throw new CheckoutDataError(
      "INVALID_QUANTITY",
      "Every checkout item must include a valid quantity."
    );
  }

  return {
    productId,
    quantity: item.quantity,
    size: item.size ?? null,
  };
}


/*
  Convert the Firestore store document into the trusted checkout store
  snapshot.
*/
function mapTrustedStore(
  storeSnapshot: DocumentSnapshot
): TrustedCheckoutStore {
  if (!storeSnapshot.exists) {
    throw new CheckoutDataError(
      "STORE_NOT_FOUND",
      "The selected store no longer exists."
    );
  }

  const data =
    storeSnapshot.data();

  if (!data) {
    throw new CheckoutDataError(
      "STORE_NOT_FOUND",
      "The selected store could not be loaded."
    );
  }

  /*
    Stores must be approved for owner access and activated before they can
    receive customer orders.
  */
  if (data.isApproved !== true || data.isActive !== true) {
    throw new CheckoutDataError(
      "STORE_UNAVAILABLE",
      "The selected store is not currently accepting orders."
    );
  }

  const stripeAccountId =
    typeof data.stripeAccountId === "string"
      ? data.stripeAccountId.trim()
      : "";

  const stripeTransfersEnabled =
    data.stripeTransfersEnabled === true;

  const stripeIsReady =
    data.stripeIsReady === true;

  /*
    Prevent LIA from collecting customer payments for a store that
    cannot receive its future transfer.
  */
  if (
    !stripeAccountId ||
    !stripeTransfersEnabled ||
    !stripeIsReady ||
    data.stripeConnectApiVersion !== "v2"
  ) {
    throw new CheckoutDataError(
      "STORE_STRIPE_NOT_READY",
      "This store is not ready to receive online payments."
    );
  }

  return {
    id: storeSnapshot.id,

    ownerId: requireString(
      data,
      "ownerId",
      "The store owner information is invalid."
    ),

    name: requireString(
      data,
      "name",
      "The store name is invalid."
    ),

    address: requireString(
      data,
      "address",
      "The store address is invalid."
    ),

    phone: requireString(
      data,
      "phone",
      "The store phone number is invalid."
    ),

    latitude: requireNumber(
      data,
      "latitude",
      "The store latitude is invalid."
    ),

    longitude: requireNumber(
      data,
      "longitude",
      "The store longitude is invalid."
    ),

    stripeAccountId,

    stripeTransfersEnabled,

    stripeIsReady,
  };
}


/*
  Convert one trusted product document into an order item snapshot.
*/
function mapTrustedItem(
  productSnapshot: DocumentSnapshot,
  input: ReturnType<typeof validateItemInput>,
  expectedStoreId: string
): TrustedCheckoutItem {
  if (!productSnapshot.exists) {
    throw new CheckoutDataError(
      "PRODUCT_NOT_FOUND",
      "One of the selected products no longer exists."
    );
  }

  const product =
    productSnapshot.data();

  if (!product) {
    throw new CheckoutDataError(
      "PRODUCT_NOT_FOUND",
      "One of the selected products could not be loaded."
    );
  }

  const productName =
    typeof product.name === "string" &&
    product.name.trim().length > 0
      ? product.name.trim()
      : "Selected product";

  if (
    typeof product.storeId !== "string" ||
    product.storeId.trim() !== expectedStoreId
  ) {
    throw new CheckoutDataError(
      "PRODUCT_STORE_MISMATCH",
      `${productName} does not belong to the selected store.`
    );
  }

  if (product.isAvailable === false) {
    throw new CheckoutDataError(
      "PRODUCT_UNAVAILABLE",
      `${productName} is currently unavailable.`
    );
  }

  const availableStock =
    Number(product.stock);

  if (
    !Number.isSafeInteger(availableStock) ||
    availableStock < input.quantity
  ) {
    throw new CheckoutDataError(
      "INSUFFICIENT_STOCK",
      `${productName} does not have enough stock available.`
    );
  }

  const originalUnitPriceAmount =
    dollarsToCents(
      product.price,
      productName
    );

  const unitPriceAmount =
    getTrustedDiscountedUnitPriceAmount(
      product.price,
      product.promotion,
      originalUnitPriceAmount
    );

  const lineTotalAmount =
    unitPriceAmount *
    input.quantity;

  if (
    !Number.isSafeInteger(lineTotalAmount)
  ) {
    throw new CheckoutDataError(
      "INVALID_PRODUCT_PRICE",
      `${productName} produced an invalid checkout amount.`
    );
  }

  return {
    productId: productSnapshot.id,

    storeId: expectedStoreId,

    name: productName,

    unitPriceAmount,

    originalUnitPriceAmount:
      unitPriceAmount < originalUnitPriceAmount
        ? originalUnitPriceAmount
        : undefined,

    quantity: input.quantity,

    lineTotalAmount,

    imageUrl:
      typeof product.imageUrl === "string" &&
      product.imageUrl.trim().length > 0
        ? product.imageUrl.trim()
        : undefined,

    size: input.size ?? null,
  };
}


/*
  Load and validate the trusted checkout store and products.
*/
async function loadTrustedCheckoutData(
  storeId: string,
  requestedItems: CheckoutPaymentItemInput[]
): Promise<TrustedCheckoutData> {
  const normalizedStoreId =
    storeId.trim();

  if (!normalizedStoreId) {
    throw new CheckoutDataError(
      "INVALID_STORE_ID",
      "A valid store ID is required."
    );
  }

  if (
    !Array.isArray(requestedItems) ||
    requestedItems.length === 0
  ) {
    throw new CheckoutDataError(
      "INVALID_ITEMS",
      "Checkout must include at least one product."
    );
  }

  /*
    Normalize the browser selections before reading Firestore.
  */
  const normalizedItems =
    requestedItems.map(
      validateItemInput
    );

  /*
    Prevent duplicate product entries.

    The cart should combine quantities before checkout. Rejecting
    duplicates keeps subtotal and inventory calculations predictable.
  */
  const uniqueProductIds =
    new Set(
      normalizedItems.map(
        (item) => item.productId
      )
    );

  if (
    uniqueProductIds.size !==
    normalizedItems.length
  ) {
    throw new CheckoutDataError(
      "INVALID_ITEMS",
      "Checkout contains duplicate product entries."
    );
  }

  const storeReference =
    db.collection("stores")
      .doc(normalizedStoreId);

  const productReferences =
    normalizedItems.map(
      (item) =>
        db.collection("products")
          .doc(item.productId)
    );

  /*
    These reads are not inside a transaction because this step does not
    modify inventory.

    Inventory will be checked again inside the payment-success
    transaction before stock is reduced.
  */
  const [
    storeSnapshot,
    ...productSnapshots
  ] = await Promise.all([
    storeReference.get(),

    ...productReferences.map(
      (reference) =>
        reference.get()
    ),
  ]);

  const store =
    mapTrustedStore(
      storeSnapshot
    );

  const items =
    productSnapshots.map(
      (snapshot, index) =>
        mapTrustedItem(
          snapshot,
          normalizedItems[index],
          normalizedStoreId
        )
    );

  const subtotalAmount =
    items.reduce(
      (
        runningTotal,
        item
      ) =>
        runningTotal +
        item.lineTotalAmount,
      0
    );

  if (
    !Number.isSafeInteger(
      subtotalAmount
    ) ||
    subtotalAmount <= 0
  ) {
    throw new CheckoutDataError(
      "INVALID_PRODUCT_PRICE",
      "The checkout subtotal is invalid."
    );
  }

  return {
    store,
    items,
    subtotalAmount,
  };
}


/*
  Type guard used by the future callable checkout function.
*/
export function isCheckoutDataError(
  error: unknown
): error is CheckoutDataError {
  return (
    error instanceof
    CheckoutDataError
  );
}


/*
  Stable service interface.
*/
export const checkoutDataService = {
  loadTrustedCheckoutData,
};

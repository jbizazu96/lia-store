/*
|--------------------------------------------------------------------------
| Stripe Customer Service
|--------------------------------------------------------------------------
|
| Creates and retrieves the Stripe Customer associated with one
| authenticated Firebase customer.
|
| Relationship:
|
| Firebase Authentication UID
|        ↓
| users/{uid}.stripeCustomerId
|        ↓
| Stripe Customer: cus_...
|
| Why this exists:
|
| Stripe saved payment methods belong to a Customer.
|
| Reusing the same Stripe Customer allows the Payment Element to:
|
| - Display previously saved payment methods
| - Let the customer select a saved method
| - Offer consent to save a new method
| - Let the customer remove a saved method
|
| This service does NOT:
|
| - Create PaymentIntents
| - Create Customer Sessions
| - List or detach payment methods directly
| - Expose the Stripe Customer ID to untrusted clients unnecessarily
*/

import {
  FieldValue,
  getFirestore,
  type DocumentData,
} from "firebase-admin/firestore";

import Stripe from "stripe";


/*
  LIA uses the Firestore database whose ID is "default".
*/
const db =
  getFirestore("default");


/*
  Trusted customer identity supplied by the authenticated callable
  function.
*/
export interface GetOrCreateStripeCustomerInput {
  /*
    Firebase Authentication UID.

    This is the stable identity used to associate the Stripe Customer
    with the LIA customer account.
  */
  firebaseUid: string;

  /*
    Email obtained from Firebase Authentication.

    Stripe can use this for Dashboard identification and receipts.
  */
  email?: string;

  /*
    Current delivery contact or profile name.

    This is optional because the Stripe Customer can exist without it.
  */
  name?: string;

  /*
    Current delivery contact or profile phone.

    This is optional because the Stripe Customer can exist without it.
  */
  phone?: string;
}


/*
  Safe result used by payment preparation.
*/
export interface StripeCustomerResult {
  customerId: string;

  customer: Stripe.Customer;
}


/*
  Predictable application-level errors.
*/
export type StripeCustomerServiceErrorCode =
  | "INVALID_FIREBASE_UID"
  | "USER_NOT_FOUND"
  | "STRIPE_CUSTOMER_CONFLICT"
  | "INVALID_STORED_CUSTOMER"
  | "CUSTOMER_PERSISTENCE_FAILED";


/*
  Expected Stripe customer service error.
*/
export class StripeCustomerServiceError extends Error {
  readonly code:
    StripeCustomerServiceErrorCode;

  constructor(
    code:
      StripeCustomerServiceErrorCode,
    message: string
  ) {
    super(message);

    this.name =
      "StripeCustomerServiceError";

    this.code =
      code;
  }
}


/*
  Safely read an optional normalized string from Firestore.
*/
function getOptionalString(
  data: DocumentData,
  fieldName: string
): string | undefined {
  const value =
    data[fieldName];

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized =
    value.trim();

  return normalized || undefined;
}


/*
  Normalize an optional string before sending it to Stripe.

  Empty values become undefined so we do not overwrite useful Stripe
  fields with blank strings.
*/
function normalizeOptionalString(
  value: string | undefined
): string | undefined {
  const normalized =
    value?.trim();

  return normalized || undefined;
}


/*
  Retrieve an existing Stripe Customer.

  Deleted Stripe Customers are rejected because they cannot be used for
  new saved payment methods or Customer Sessions.
*/
async function retrieveActiveCustomer(
  stripe: Stripe,
  customerId: string
): Promise<Stripe.Customer> {
  const customer =
    await stripe.customers.retrieve(
      customerId
    );

  if (customer.deleted) {
    throw new StripeCustomerServiceError(
      "INVALID_STORED_CUSTOMER",
      "The stored Stripe customer has been deleted."
    );
  }

  return customer;
}


/*
  Save the Stripe Customer ID only if the user does not already have a
  conflicting customer association.

  This transaction protects against accidentally replacing one Stripe
  Customer with another.
*/
async function persistStripeCustomerId(
  firebaseUid: string,
  customerId: string
): Promise<void> {
  const userReference =
    db.collection("users")
      .doc(firebaseUid);

  try {
    await db.runTransaction(
      async (
        transaction
      ) => {
        const userSnapshot =
          await transaction.get(
            userReference
          );

        if (!userSnapshot.exists) {
          throw new StripeCustomerServiceError(
            "USER_NOT_FOUND",
            "The authenticated customer profile does not exist."
          );
        }

        const userData =
          userSnapshot.data() ?? {};

        const existingCustomerId =
          getOptionalString(
            userData,
            "stripeCustomerId"
          );

        /*
          Allowed:

          - No Stripe Customer has been stored yet
          - The stored ID matches the Customer being persisted

          Rejected:

          - The user already references a different Stripe Customer
        */
        if (
          existingCustomerId &&
          existingCustomerId !==
            customerId
        ) {
          throw new StripeCustomerServiceError(
            "STRIPE_CUSTOMER_CONFLICT",
            "This customer account is already connected to another Stripe customer."
          );
        }

        transaction.update(
          userReference,
          {
            stripeCustomerId:
              customerId,

            stripeCustomerCreatedAt:
              existingCustomerId
                ? (
                    userData
                      .stripeCustomerCreatedAt ??
                    FieldValue
                      .serverTimestamp()
                  )
                : FieldValue
                    .serverTimestamp(),

            stripeCustomerUpdatedAt:
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
      StripeCustomerServiceError
    ) {
      throw error;
    }

    console.error(
      "Stripe customer persistence failed:",
      {
        firebaseUid,
        customerId,
        error,
      }
    );

    throw new StripeCustomerServiceError(
      "CUSTOMER_PERSISTENCE_FAILED",
      "The Stripe customer relationship could not be saved."
    );
  }
}


/*
  Get the existing Stripe Customer or create it once.

  Idempotency behavior:

  The customer creation request uses the Firebase UID in a stable
  idempotency key.

  If the callable function is retried after Stripe created the Customer
  but before Firestore saved the response, Stripe returns the original
  Customer instead of creating another one.
*/
async function getOrCreateStripeCustomer(
  stripe: Stripe,
  input: GetOrCreateStripeCustomerInput
): Promise<StripeCustomerResult> {
  const firebaseUid =
    input.firebaseUid.trim();

  if (!firebaseUid) {
    throw new StripeCustomerServiceError(
      "INVALID_FIREBASE_UID",
      "A valid authenticated customer ID is required."
    );
  }

  const userReference =
    db.collection("users")
      .doc(firebaseUid);

  const userSnapshot =
    await userReference.get();

  if (!userSnapshot.exists) {
    throw new StripeCustomerServiceError(
      "USER_NOT_FOUND",
      "The authenticated customer profile does not exist."
    );
  }

  const userData =
    userSnapshot.data() ?? {};

  const existingCustomerId =
    getOptionalString(
      userData,
      "stripeCustomerId"
    );

  /*
    Reuse the established customer relationship.
  */
  if (existingCustomerId) {
    const customer =
      await retrieveActiveCustomer(
        stripe,
        existingCustomerId
      );

    return {
      customerId:
        customer.id,

      customer,
    };
  }

  const normalizedEmail =
    normalizeOptionalString(
      input.email
    );

  const normalizedName =
    normalizeOptionalString(
      input.name
    );

  const normalizedPhone =
    normalizeOptionalString(
      input.phone
    );

  /*
    Create the Customer on LIA's platform Stripe account.

    Do not pass a connected-account request option here.
  */
  const customer =
    await stripe.customers.create(
      {
        email:
          normalizedEmail,

        name:
          normalizedName,

        phone:
          normalizedPhone,

        metadata: {
          liaFirebaseUid:
            firebaseUid,

          liaCustomerType:
            "customer",

          liaCustomerVersion:
            "v1",
        },
      },

      {
        /*
          Stable across retries for this Firebase user.
        */
        idempotencyKey:
          `lia-stripe-customer-${firebaseUid}`,
      }
    );

  /*
    Save the Stripe Customer relationship after Stripe creation.

    The stable idempotency key protects against duplicate customer
    creation if the request is retried.
  */
  await persistStripeCustomerId(
    firebaseUid,
    customer.id
  );

  return {
    customerId:
      customer.id,

    customer,
  };
}


/*
  Type guard used by the future checkout orchestrator.
*/
export function isStripeCustomerServiceError(
  error: unknown
): error is StripeCustomerServiceError {
  return (
    error instanceof
    StripeCustomerServiceError
  );
}


/*
  Stable service interface.
*/
export const stripeCustomerService = {
  getOrCreateStripeCustomer,
};
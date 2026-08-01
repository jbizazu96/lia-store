/*
|--------------------------------------------------------------------------
| Stripe Default Payment Method Service
|--------------------------------------------------------------------------
|
| Promotes the successfully used saved payment method to become the
| customer's preferred payment method for later LIA checkouts.
|
| Desired returning-customer experience:
|
| First successful payment
|   → Customer consents to save the payment method
|   → Stripe attaches it to the Customer
|   → LIA marks it as the Customer's default
|
| Later checkout
|   → Stripe displays the default saved method first
|   → Customer only needs to press Pay
|
| Important:
|
| This service does not bypass:
|
| - Customer consent
| - Card issuer authentication
| - 3D Secure
| - Stripe Link verification
| - Stripe Radar checks
|
| It also does not force allow_redisplay to "always".
|
| Stripe's Payment Element sets allow_redisplay based on the customer's
| save-payment-method consent.
*/

import Stripe from "stripe";


/*
|--------------------------------------------------------------------------
| Result
|--------------------------------------------------------------------------
*/

export type SaveDefaultPaymentMethodResult =
  | {
      updated: true;

      paymentMethodId: string;
    }
  | {
      updated: false;

      reason:
        | "payment_method_missing"
        | "payment_method_not_attached"
        | "customer_mismatch"
        | "redisplay_not_allowed"
        | "unsupported_payment_method";
    };


/*
|--------------------------------------------------------------------------
| Errors
|--------------------------------------------------------------------------
*/

export type StripeDefaultPaymentMethodErrorCode =
  | "INVALID_PAYMENT_INTENT_ID"
  | "INVALID_CUSTOMER_ID"
  | "PAYMENT_INTENT_CUSTOMER_MISMATCH"
  | "PAYMENT_INTENT_NOT_SUCCEEDED"
  | "DEFAULT_PAYMENT_METHOD_UPDATE_FAILED";


export class StripeDefaultPaymentMethodError extends Error {
  readonly code:
    StripeDefaultPaymentMethodErrorCode;

  constructor(
    code:
      StripeDefaultPaymentMethodErrorCode,
    message: string
  ) {
    super(message);

    this.name =
      "StripeDefaultPaymentMethodError";

    this.code =
      code;
  }
}


/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function requireIdentifier(
  value: string,
  prefix: string,
  code:
    StripeDefaultPaymentMethodErrorCode,
  message: string
): string {
  const normalized =
    value.trim();

  if (
    !normalized ||
    !normalized.startsWith(
      prefix
    )
  ) {
    throw new StripeDefaultPaymentMethodError(
      code,
      message
    );
  }

  return normalized;
}


function getCustomerId(
  customer:
    string |
    Stripe.Customer |
    Stripe.DeletedCustomer |
    null
): string | null {
  if (
    typeof customer ===
    "string"
  ) {
    return customer;
  }

  return customer?.id ?? null;
}


function getPaymentMethod(
  value:
    string |
    Stripe.PaymentMethod |
    null
): Stripe.PaymentMethod | null {
  if (
    !value ||
    typeof value ===
      "string"
  ) {
    return null;
  }

  return value;
}


/*
|--------------------------------------------------------------------------
| Save Successful Method As Default
|--------------------------------------------------------------------------
*/

async function saveSuccessfulMethodAsDefault(
  stripe: Stripe,
  paymentIntentIdValue: string,
  expectedCustomerIdValue: string
): Promise<
  SaveDefaultPaymentMethodResult
> {
  const paymentIntentId =
    requireIdentifier(
      paymentIntentIdValue,
      "pi_",
      "INVALID_PAYMENT_INTENT_ID",
      "A valid Stripe PaymentIntent ID is required."
    );

  const expectedCustomerId =
    requireIdentifier(
      expectedCustomerIdValue,
      "cus_",
      "INVALID_CUSTOMER_ID",
      "A valid Stripe Customer ID is required."
    );

  try {
    /*
      Retrieve the PaymentIntent directly from Stripe.

      Expanding payment_method gives us the authoritative PaymentMethod
      object without trusting the webhook payload alone.
    */
    const paymentIntent =
      await stripe
        .paymentIntents
        .retrieve(
          paymentIntentId,
          {
            expand: [
              "payment_method",
            ],
          }
        );

    if (
      paymentIntent.status !==
      "succeeded"
    ) {
      throw new StripeDefaultPaymentMethodError(
        "PAYMENT_INTENT_NOT_SUCCEEDED",
        "Only a successful payment can update the default payment method."
      );
    }

    const paymentIntentCustomerId =
      getCustomerId(
        paymentIntent.customer
      );

    if (
      paymentIntentCustomerId !==
      expectedCustomerId
    ) {
      throw new StripeDefaultPaymentMethodError(
        "PAYMENT_INTENT_CUSTOMER_MISMATCH",
        "The successful payment does not belong to the expected Stripe Customer."
      );
    }

    const paymentMethod =
      getPaymentMethod(
        paymentIntent.payment_method
      );

    if (!paymentMethod) {
      return {
        updated:
          false,

        reason:
          "payment_method_missing",
      };
    }

    /*
      LIA currently promotes reusable card methods.

      Other payment-method types may have different reuse requirements
      and will be handled separately when LIA enables them.
    */
    if (
      paymentMethod.type !==
      "card"
    ) {
      return {
        updated:
          false,

        reason:
          "unsupported_payment_method",
      };
    }

    const paymentMethodCustomerId =
      getCustomerId(
        paymentMethod.customer
      );

    if (!paymentMethodCustomerId) {
      /*
        The customer did not consent to save this payment method, so it
        was not attached for future use.
      */
      return {
        updated:
          false,

        reason:
          "payment_method_not_attached",
      };
    }

    if (
      paymentMethodCustomerId !==
      expectedCustomerId
    ) {
      return {
        updated:
          false,

        reason:
          "customer_mismatch",
      };
    }

    /*
      Never override Stripe's consent-based redisplay setting.

      Only methods explicitly eligible for future checkout redisplay may
      become LIA's default saved method.
    */
    if (
      paymentMethod.allow_redisplay !==
      "always"
    ) {
      return {
        updated:
          false,

        reason:
          "redisplay_not_allowed",
      };
    }

    /*
      Set the successful, reusable method as the Customer default.

      Stripe displays a Customer's default method first among saved
      payment methods in later Payment Element checkouts.
    */
    await stripe.customers.update(
      expectedCustomerId,
      {
        invoice_settings: {
          default_payment_method:
            paymentMethod.id,
        },

        metadata: {
          liaDefaultPaymentMethodId:
            paymentMethod.id,

          liaDefaultPaymentMethodSource:
            "successful_customer_payment",
        },
      }
    );

    console.log(
      "Stripe customer default payment method updated:",
      {
        customerId:
          expectedCustomerId,

        paymentMethodId:
          paymentMethod.id,

        paymentIntentId,
      }
    );

    return {
      updated:
        true,

      paymentMethodId:
        paymentMethod.id,
    };
  } catch (
    error: unknown
  ) {
    if (
      error instanceof
      StripeDefaultPaymentMethodError
    ) {
      throw error;
    }

    console.error(
      "Unable to update Stripe customer default payment method:",
      {
        paymentIntentId,

        customerId:
          expectedCustomerId,

        error,
      }
    );

    throw new StripeDefaultPaymentMethodError(
      "DEFAULT_PAYMENT_METHOD_UPDATE_FAILED",
      "The customer's default payment method could not be updated."
    );
  }
}


/*
|--------------------------------------------------------------------------
| Type Guard
|--------------------------------------------------------------------------
*/

export function isStripeDefaultPaymentMethodError(
  error: unknown
): error is StripeDefaultPaymentMethodError {
  return (
    error instanceof
    StripeDefaultPaymentMethodError
  );
}


/*
|--------------------------------------------------------------------------
| Service
|--------------------------------------------------------------------------
*/

export const stripeDefaultPaymentMethodService = {
  saveSuccessfulMethodAsDefault,
};
/*
|--------------------------------------------------------------------------
| Stripe Customer Payment Webhook
|--------------------------------------------------------------------------
|
| Receives classic Stripe PaymentIntent webhook events for customer
| checkout payments.
|
| This endpoint is separate from:
|
| stripeConnectWebhook
|
| Connect webhook:
|   Synchronizes store connected-account status.
|
| Payment webhook:
|   Synchronizes customer payment state and activates paid orders.
|
| Supported events:
|
| - payment_intent.processing
| - payment_intent.payment_failed
| - payment_intent.succeeded
|
| Security:
|
| Stripe signs the untouched raw request body.
|
| Firebase provides request.rawBody, which must be passed directly to
| stripe.webhooks.constructEvent().
*/

import {
  isStripeDefaultPaymentMethodError,
  stripeDefaultPaymentMethodService,
} from "../payment/stripe/stripeDefaultPaymentMethodService";

import {
  defineSecret,
} from "firebase-functions/params";

import {
  onRequest,
} from "firebase-functions/v2/https";

import Stripe from "stripe";

import {
  isPaidOrderActivationError,
  paidOrderActivationService,
} from "../payment/activation/paidOrderActivationService";

import {
  isPaymentStatusServiceError,
  paymentStatusService,
} from "../payment/paymentStatusService";

import {
  isStripePaymentWebhookEventServiceError,
  stripePaymentWebhookEventService,
} from "../payment/stripe/stripePaymentWebhookEventService";

import {
  isStripePaymentWebhookValidationError,
  validateStripePaymentEvent,
} from "../payment/stripe/stripePaymentWebhookValidation";

import {
  storeEvents,
} from "../events/storeEvents";
import {
  recordStripeProcessingFee,
} from "../payment/stripe/stripeProcessingFeeService";




/*
|--------------------------------------------------------------------------
| Secrets
|--------------------------------------------------------------------------
*/

/*
  LIA platform Stripe secret key.
*/
const stripeSecretKey =
  defineSecret(
    "STRIPE_SECRET_KEY"
  );


/*
  Signing secret belonging only to the customer-payment webhook endpoint.

  This is different from:

  STRIPE_CONNECT_WEBHOOK_SECRET

  Webhook signing secrets begin with:

  whsec_
*/
const stripePaymentWebhookSecret =
  defineSecret(
    "STRIPE_PAYMENT_WEBHOOK_SECRET"
  );


/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function getFailureReason(
  error: unknown
): string {
  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message
      .trim()
      .slice(
        0,
        500
      );
  }

  return (
    "Unknown Stripe payment webhook processing failure."
  );
}


/*
|--------------------------------------------------------------------------
| Webhook
|--------------------------------------------------------------------------
*/

export const stripePaymentWebhook =
  onRequest(
    {
      region:
        "us-central1",

      secrets: [
        stripeSecretKey,
        stripePaymentWebhookSecret,
      ],

      maxInstances:
        10,

      timeoutSeconds:
        60,
    },

    async (
      request,
      response
    ) => {
      /*
      |--------------------------------------------------------------------------
      | Method
      |--------------------------------------------------------------------------
      */

      if (
        request.method !==
        "POST"
      ) {
        response
          .status(405)
          .set(
            "Allow",
            "POST"
          )
          .send(
            "Method Not Allowed"
          );

        return;
      }


      /*
      |--------------------------------------------------------------------------
      | Stripe Signature
      |--------------------------------------------------------------------------
      */

      const signature =
        request.headers[
          "stripe-signature"
        ];

      if (
        typeof signature !==
          "string" ||
        !signature.trim()
      ) {
        console.error(
          "Stripe payment webhook received no Stripe-Signature header."
        );

        response
          .status(400)
          .send(
            "Missing Stripe signature."
          );

        return;
      }


      /*
      |--------------------------------------------------------------------------
      | Verify Event
      |--------------------------------------------------------------------------
      */

      const stripe =
        new Stripe(
          stripeSecretKey.value()
        );

      let stripeEvent:
        Stripe.Event;

      try {
        stripeEvent =
          stripe.webhooks
            .constructEvent(
              request.rawBody,
              signature,
              stripePaymentWebhookSecret
                .value()
            );
      } catch (
        error: unknown
      ) {
        console.error(
          "Stripe payment webhook signature verification failed:",
          error
        );

        response
          .status(400)
          .send(
            "Invalid Stripe webhook."
          );

        return;
      }


      /*
      |--------------------------------------------------------------------------
      | Ignore Unsupported Events
      |--------------------------------------------------------------------------
      |
      | Validate only the three PaymentIntent events currently used by
      | LIA.
      |
      */

      if (
        stripeEvent.type !==
          "payment_intent.processing" &&
        stripeEvent.type !==
          "payment_intent.payment_failed" &&
        stripeEvent.type !==
          "payment_intent.succeeded"
      ) {
        console.log(
          "Ignoring unsupported Stripe payment event:",
          {
            eventId:
              stripeEvent.id,

            eventType:
              stripeEvent.type,
          }
        );

        response
          .status(200)
          .json({
            received:
              true,

            processed:
              false,
          });

        return;
      }


      /*
      |--------------------------------------------------------------------------
      | Validate Payment Event
      |--------------------------------------------------------------------------
      */

      let paymentEvent:
        ReturnType<
          typeof validateStripePaymentEvent
        >;

      try {
        paymentEvent =
          validateStripePaymentEvent(
            stripeEvent
          );
      } catch (
        error: unknown
      ) {
        if (
          isStripePaymentWebhookValidationError(
            error
          )
        ) {
          console.error(
            "Stripe payment webhook payload validation failed:",
            {
              code:
                error.code,

              message:
                error.message,

              eventId:
                stripeEvent.id,

              eventType:
                stripeEvent.type,
            }
          );
        } else {
          console.error(
            "Unexpected Stripe payment event validation failure:",
            {
              error,

              eventId:
                stripeEvent.id,

              eventType:
                stripeEvent.type,
            }
          );
        }

        /*
          The Stripe signature is valid, but the event cannot safely be
          mapped to LIA.

          Return 400 because retrying the same malformed event will not
          fix it.
        */
        response
          .status(400)
          .send(
            "Invalid Stripe payment event."
          );

        return;
      }


      /*
      |--------------------------------------------------------------------------
      | Claim Event
      |--------------------------------------------------------------------------
      */

      let claimedEventId:
        string | null = null;

      try {
        const claimResult =
          await stripePaymentWebhookEventService
            .claimEvent({
              eventId:
                paymentEvent
                  .eventId,

              eventType:
                paymentEvent
                  .eventType,

              paymentIntentId:
                paymentEvent
                  .paymentIntentId,

              orderId:
                paymentEvent
                  .metadata
                  .orderId,

              livemode:
                paymentEvent
                  .livemode,
            });

        if (
          claimResult.type ===
          "already_processed"
        ) {
          console.log(
            "Stripe payment event already processed:",
            {
              eventId:
                paymentEvent
                  .eventId,

              eventType:
                paymentEvent
                  .eventType,

              paymentIntentId:
                paymentEvent
                  .paymentIntentId,
            }
          );

          response
            .status(200)
            .json({
              received:
                true,

              processed:
                false,

              duplicate:
                true,
            });

          return;
        }

        if (
          claimResult.type ===
          "already_processing"
        ) {
          console.log(
            "Stripe payment event is already being processed:",
            {
              eventId:
                paymentEvent
                  .eventId,

              eventType:
                paymentEvent
                  .eventType,
            }
          );

          /*
            A concurrent request owns this event.

            Return 200 so Stripe does not immediately retry while the
            first request is still working.
          */
          response
            .status(200)
            .json({
              received:
                true,

              processed:
                false,

              concurrent:
                true,
            });

          return;
        }

        claimedEventId =
          claimResult.eventId;

        /*
        |--------------------------------------------------------------------------
        | Payment Processing
        |--------------------------------------------------------------------------
        */

        if (
          paymentEvent.eventType ===
          "payment_intent.processing"
        ) {
          await paymentStatusService
            .markProcessing(
              paymentEvent
            );
        }


        /*
        |--------------------------------------------------------------------------
        | Payment Failed
        |--------------------------------------------------------------------------
        */

        if (
          paymentEvent.eventType ===
          "payment_intent.payment_failed"
        ) {
          await paymentStatusService
            .markPaymentFailed(
              paymentEvent
            );
        }
        /*
        |--------------------------------------------------------------------------
        | Process Event
        |--------------------------------------------------------------------------
        */

                if (
          paymentEvent.eventType ===
          "payment_intent.succeeded"
        ) {
          /*
          |--------------------------------------------------------------------------
          | Activate Paid Order
          |--------------------------------------------------------------------------
          */

          const activation =
            await paidOrderActivationService
              .activatePaidOrder(
                paymentEvent
              );

          /*
           * Record Stripe's actual processing fee separately from LIA's
           * marketplace allocation. This is informational accounting only:
           * a delayed Stripe balance transaction must never undo a paid
           * order or cause Stripe to retry fulfillment.
           */
          try {
            if (
              paymentEvent.stripeChargeId
            ) {
              await recordStripeProcessingFee({
                stripe,
                orderId: activation.orderId,
                stripeChargeId: paymentEvent.stripeChargeId,
              });
            }
          } catch (processingFeeError) {
            console.error(
              "Unable to record the Stripe processing fee:",
              {
                orderId: activation.orderId,
                error: getFailureReason(processingFeeError),
              },
            );
          }


          /*
          |--------------------------------------------------------------------------
          | Save Successful Payment Method As Default
          |--------------------------------------------------------------------------
          |
          | This happens only after Stripe confirms payment.
          |
          | The service updates the default only when:
          |
          | - The payment method is attached to this Stripe Customer
          | - The customer consented to future redisplay
          | - allow_redisplay is "always"
          |
          | A failure here must not reverse a successful payment or prevent the
          | paid order from being activated.
          |
          */

          try {
            const defaultPaymentMethodResult =
              await stripeDefaultPaymentMethodService
                .saveSuccessfulMethodAsDefault(
                  stripe,
                  paymentEvent
                    .paymentIntentId,
                  paymentEvent
                    .customerId
                );

            if (
              !defaultPaymentMethodResult
                .updated
            ) {
              console.log(
                "Successful payment method was not promoted to default:",
                {
                  eventId:
                    paymentEvent
                      .eventId,

                  paymentIntentId:
                    paymentEvent
                      .paymentIntentId,

                  customerId:
                    paymentEvent
                      .customerId,

                  reason:
                    defaultPaymentMethodResult
                      .reason,
                }
              );
            }
          } catch (
            defaultPaymentMethodError:
              unknown
          ) {
            /*
              The payment and order are already successful.

              Default-card preference is a convenience feature and must not
              cause Stripe to retry the entire order-activation webhook.
            */
            if (
              isStripeDefaultPaymentMethodError(
                defaultPaymentMethodError
              )
            ) {
              console.error(
                "Unable to promote successful payment method to default:",
                {
                  code:
                    defaultPaymentMethodError
                      .code,

                  message:
                    defaultPaymentMethodError
                      .message,

                  eventId:
                    paymentEvent
                      .eventId,

                  paymentIntentId:
                    paymentEvent
                      .paymentIntentId,

                  customerId:
                    paymentEvent
                      .customerId,
                }
              );
            } else {
              console.error(
                "Unexpected default payment-method update failure:",
                {
                  error:
                    defaultPaymentMethodError,

                  eventId:
                    paymentEvent
                      .eventId,

                  paymentIntentId:
                    paymentEvent
                      .paymentIntentId,
                }
              );
            }
          }

          /*
          |--------------------------------------------------------------------------
          | Store notifications
          |--------------------------------------------------------------------------
          |
          | A payment-pending order must remain invisible to the store.  Send the
          | store notification only after the activation transaction has confirmed
          | both the payment and checkout.  `newlyActivated` also makes these side
          | effects safe when Stripe redelivers an event.
          |
          */

          if (activation.newlyActivated) {
            try {
              await storeEvents.newOrder(
                activation.orderId,
                activation.storeOwnerUid
              );
            } catch (notificationError) {
              // A notification must never undo a successful payment activation.
              console.error(
                "Unable to create the store new-order notification:",
                notificationError
              );
            }

            for (const alert of activation.lowStockAlerts) {
              try {
                await storeEvents.lowStock(
                  alert.productId,
                  alert.productName,
                  alert.remainingStock,
                  activation.storeOwnerUid
                );
              } catch (notificationError) {
                // Continue notifying about other stock alerts when one fails.
                console.error(
                  "Unable to create the store low-stock notification:",
                  notificationError
                );
              }
            }
          }


  /*
  |--------------------------------------------------------------------------
  | Success Logging
  |--------------------------------------------------------------------------
  |
  | Notification and low-stock side effects will be added after the
  | core payment transaction is proven.
  |
  | activation.newlyActivated prevents repeated fulfillment side effects
  | when another valid Stripe event references an already-paid order.
  |
  */

  console.log(
    "Stripe payment succeeded and order activated:",
    {
      eventId:
        paymentEvent
          .eventId,

      paymentIntentId:
        paymentEvent
          .paymentIntentId,

      orderId:
        activation
          .orderId,

      orderNumber:
        activation
          .orderNumber,

      newlyActivated:
        activation
          .newlyActivated,

      lowStockAlertCount:
        activation
          .lowStockAlerts
          .length,
    }
  );
}


        /*
        |--------------------------------------------------------------------------
        | Complete Event
        |--------------------------------------------------------------------------
        */

        await stripePaymentWebhookEventService
          .markProcessed(
            claimedEventId
          );

        console.log(
          "Stripe payment webhook processed:",
          {
            eventId:
              paymentEvent
                .eventId,

            eventType:
              paymentEvent
                .eventType,

            paymentIntentId:
              paymentEvent
                .paymentIntentId,

            orderId:
              paymentEvent
                .metadata
                .orderId,
          }
        );

        response
          .status(200)
          .json({
            received:
              true,

            processed:
              true,
          });
      } catch (
        error: unknown
      ) {
        const failureReason =
          getFailureReason(
            error
          );

        if (
          claimedEventId
        ) {
          await stripePaymentWebhookEventService
            .markFailed(
              claimedEventId,
              failureReason
            );
        }

        if (
          isStripePaymentWebhookEventServiceError(
            error
          )
        ) {
          console.error(
            "Stripe payment webhook event persistence failed:",
            {
              code:
                error.code,

              message:
                error.message,

              eventId:
                paymentEvent
                  .eventId,
            }
          );
        } else if (
          isPaidOrderActivationError(
            error
          )
        ) {
          console.error(
            "Paid order activation failed:",
            {
              code:
                error.code,

              message:
                error.message,

              eventId:
                paymentEvent
                  .eventId,

              orderId:
                paymentEvent
                  .metadata
                  .orderId,
            }
          );
        } else if (
          isPaymentStatusServiceError(
            error
          )
        ) {
          console.error(
            "Payment status synchronization failed:",
            {
              code:
                error.code,

              message:
                error.message,

              eventId:
                paymentEvent
                  .eventId,

              orderId:
                paymentEvent
                  .metadata
                  .orderId,
            }
          );
        } else if (
          error instanceof
            Stripe.errors.StripeError
        ) {
          console.error(
            "Stripe API failed during payment webhook processing:",
            {
              type:
                error.type,

              code:
                error.code,

              message:
                error.message,

              requestId:
                error.requestId,

              eventId:
                paymentEvent
                  .eventId,
            }
          );
        } else {
          console.error(
            "Unexpected Stripe payment webhook failure:",
            {
              error,

              eventId:
                paymentEvent
                  .eventId,

              eventType:
                paymentEvent
                  .eventType,

              orderId:
                paymentEvent
                  .metadata
                  .orderId,
            }
          );
        }

        /*
          Return a retryable server error.

          Stripe will redeliver the event, and the idempotency service
          allows failed claims to be processed again.
        */
        response
          .status(500)
          .send(
            "Stripe payment webhook processing failed."
          );
      }
    }
  );

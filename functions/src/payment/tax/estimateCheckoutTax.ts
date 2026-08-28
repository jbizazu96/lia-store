import * as admin from "firebase-admin";
import {getFirestore} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import Stripe from "stripe";
import {requireAccountOperational} from "../../accountDeletion/accountDeletionAccessService";
import {enforceCallableAbuseProtection} from "../../security/callableAbuseProtection";
import {checkoutDataService} from "../checkout/checkoutDataService";
import {validatePrepareCheckoutPaymentRequest} from "../checkout/checkoutPaymentValidation";
import {createStripeTaxCalculation} from "./stripeTaxCalculationService";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");

function centAmount(value: unknown, label: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > maximum) {
    throw new HttpsError("invalid-argument", `${label} is invalid.`);
  }
  return Number(value);
}

/**
 * Returns a non-binding Stripe Tax estimate for the checkout review screen.
 * Final checkout independently reloads route pricing, inventory, addresses,
 * classifications, and Stripe Tax before creating the PaymentIntent.
 */
export const estimateCheckoutTax = onCall(
  {
    region: "us-central1",
    secrets: [stripeSecretKey],
    maxInstances: 10,
    timeoutSeconds: 30,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to estimate sales tax.");
    }
    await requireAccountOperational(request.auth.uid);
    await enforceCallableAbuseProtection({
      operation: "estimate-checkout-tax",
      uid: request.auth.uid,
      appCheckVerified: Boolean(request.app),
      maximumRequests: 30,
      windowSeconds: 300,
    });

    const customer = await db.collection("users").doc(request.auth.uid).get();
    if (!customer.exists || customer.data()?.accountType !== "customer" ||
        customer.data()?.isActive === false) {
      throw new HttpsError("permission-denied", "This account cannot estimate checkout tax.");
    }

    try {
      const checkoutRequest = validatePrepareCheckoutPaymentRequest(request.data);
      const checkoutData = await checkoutDataService.loadTrustedCheckoutData(
        checkoutRequest.storeId,
        checkoutRequest.items,
      );
      const deliveryFeeAmount = checkoutRequest.fulfillmentType === "pickup"
        ? 0
        : centAmount(request.data?.deliveryFeeAmount, "Delivery fee", 100_000);
      const serviceFeeAmount = centAmount(
        request.data?.serviceFeeAmount,
        "Service fee",
        100_000,
      );
      const tipAmount = checkoutRequest.fulfillmentType === "pickup"
        ? 0
        : checkoutRequest.tipAmountCents;
      const amountBeforeTax = checkoutData.subtotalAmount +
        deliveryFeeAmount + serviceFeeAmount + tipAmount;

      const result = await createStripeTaxCalculation(
        new Stripe(stripeSecretKey.value()),
        {
          fulfillmentType: checkoutRequest.fulfillmentType,
          items: checkoutData.items,
          store: checkoutData.store,
          deliveryAddress: checkoutRequest.deliveryAddress,
          pricingBeforeTax: {
            deliveryFeeAmount,
            serviceFeeAmount,
            tipAmount,
            totalAmount: amountBeforeTax,
          },
        },
      );

      if (result.taxAmount === 0) {
        console.warn("Stripe Tax returned a zero checkout estimate", {
          calculationId: result.snapshot.calculationId,
          livemode: result.snapshot.livemode,
          fulfillmentType: checkoutRequest.fulfillmentType,
          storeId: checkoutRequest.storeId,
          destinationState: result.snapshot.customerAddress.state,
          productLines: result.snapshot.lineItems
            .filter((line) => line.type === "product")
            .map((line) => ({
              productId: line.productId,
              taxCategoryId: line.taxCategoryId,
              stripeTaxCode: line.stripeTaxCode,
              taxAmount: line.taxAmount,
              taxabilityReasons: [
                ...new Set(line.breakdown.map((entry) => entry.taxabilityReason)),
              ],
            })),
          supplementalLines: result.snapshot.lineItems
            .filter((line) => line.type !== "product")
            .map((line) => ({
              type: line.type,
              stripeTaxCode: line.stripeTaxCode,
              taxAmount: line.taxAmount,
              taxabilityReasons: [
                ...new Set(line.breakdown.map((entry) => entry.taxabilityReason)),
              ],
            })),
          calculationReasons: [
            ...new Set(
              result.snapshot.breakdown.map((entry) => entry.taxabilityReason),
            ),
          ],
        });
      }

      return {
        success: true,
        currency: "usd" as const,
        taxAmount: result.taxAmount,
        estimatedTotalAmount: result.amountTotal,
        calculatedAt: new Date().toISOString(),
        expiresAt: result.snapshot.expiresAt,
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error("Checkout tax estimate failed:", error);
      throw new HttpsError(
        "failed-precondition",
        error instanceof Error && error.message
          ? error.message
          : "Sales tax could not be estimated right now.",
      );
    }
  },
);

/*
|--------------------------------------------------------------------------
| Driver Stripe Connect API
|--------------------------------------------------------------------------
|
| One protected server route handles driver connected-account creation,
| hosted onboarding links, and status refreshes. The driver ID is always
| derived from the verified Firebase ID token, never from browser input.
|
*/

import {
  NextResponse,
} from "next/server";
import Stripe from "stripe";

import {
  isFirebaseAuthenticationError,
  requireFirebaseUser,
} from "@/lib/auth/requireFirebaseUser";
import {
  mapStripeAccount,
  mapStripeAccountSummary,
} from "@/mappers/stripeConnectMapper";
import {
  driverStripeConnectPersistenceService,
} from "@/services/payment/driverStripeConnectPersistenceService";
import {
  stripeConnectService,
} from "@/services/payment/stripeConnectService";
import {
  isDriverAuthorizationError,
  serverDriverAuthorizationService,
} from "@/services/driver/serverDriverAuthorizationService";

export const runtime = "nodejs";

type DriverStripeAction =
  | "create_account"
  | "create_onboarding_link"
  | "get_status";

function getApplicationOrigin(request: Request): string {
  const configured = process.env.APP_URL?.trim();

  return configured
    ? configured.replace(/\/+$/, "")
    : new URL(request.url).origin;
}

async function getAction(request: Request): Promise<DriverStripeAction> {
  const body = await request.json().catch(() => null);
  const action = body && typeof body === "object"
    ? Reflect.get(body, "action")
    : null;

  if (action === "create_account" || action === "create_onboarding_link" || action === "get_status") {
    return action;
  }

  throw new Error("INVALID_REQUEST");
}

function errorResponse(error: unknown) {
  if (isFirebaseAuthenticationError(error)) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 401 });
  }

  if (isDriverAuthorizationError(error)) {
    const status = error.code === "DRIVER_NOT_FOUND" ? 404 : error.code === "DRIVER_FORBIDDEN" ? 403 : 500;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }

  if (error instanceof Stripe.errors.StripeError) {
    console.error("Driver Stripe Connect request failed:", {
      type: error.type,
      code: error.code,
      message: error.message,
      requestId: error.requestId,
    });
    return NextResponse.json({ error: "Stripe could not process the driver payout request.", code: "STRIPE_REQUEST_FAILED" }, { status: 502 });
  }

  if (error instanceof Error && error.message === "INVALID_REQUEST") {
    return NextResponse.json({ error: "A valid Stripe action is required.", code: "INVALID_REQUEST" }, { status: 400 });
  }

  console.error("Unexpected driver Stripe Connect request error:", error);
  return NextResponse.json({ error: "The driver payout request could not be completed.", code: "INTERNAL_SERVER_ERROR" }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const [authenticatedUser, action] = await Promise.all([
      requireFirebaseUser(request),
      getAction(request),
    ]);
    const driver = await serverDriverAuthorizationService.requireOwnedDriver(authenticatedUser.uid);

    if (driver.stripeAccountId && driver.stripeConnectApiVersion !== "v2") {
      return NextResponse.json({ error: "This driver has a legacy Stripe connection. Contact LIA support to reconnect it.", code: "STRIPE_ACCOUNT_VERSION_MISMATCH" }, { status: 409 });
    }

    if (action === "create_account") {
      const connectedAt = driver.stripeConnectedAt ?? new Date().toISOString();
      const account = driver.stripeAccountId
        ? await stripeConnectService.getAccount(driver.stripeAccountId)
        : await stripeConnectService.createDriverAccount({
          driverId: driver.id,
          email: driver.email,
          phone: driver.phone,
          country: "US",
          fullName: driver.fullName,
        });
      const mapped = mapStripeAccount(account, "driver", driver.id, connectedAt);

      await driverStripeConnectPersistenceService.saveAuthorizedDriverAccount(mapped, authenticatedUser.uid);

      return NextResponse.json({
        account: mapStripeAccountSummary(account, "driver", driver.id),
        created: !driver.stripeAccountId,
      }, { status: driver.stripeAccountId ? 200 : 201, headers: { "Cache-Control": "no-store" } });
    }

    if (!driver.stripeAccountId) {
      return NextResponse.json({ error: "Create your Stripe account before starting payout onboarding.", code: "STRIPE_ACCOUNT_NOT_CREATED" }, { status: 409 });
    }

    if (action === "create_onboarding_link") {
      const origin = getApplicationOrigin(request);
      const returnPath = "/driver/onboarding/stripe";
      const onboarding = await stripeConnectService.createOnboardingLink({
        accountId: driver.stripeAccountId,
        refreshUrl: `${origin}${returnPath}?stripe=refresh`,
        returnUrl: `${origin}${returnPath}?stripe=return`,
      });

      return NextResponse.json({ account: null, onboarding }, { headers: { "Cache-Control": "no-store" } });
    }

    const account = await stripeConnectService.getAccount(driver.stripeAccountId);
    const mapped = mapStripeAccount(account, "driver", driver.id, driver.stripeConnectedAt ?? new Date().toISOString());
    await driverStripeConnectPersistenceService.saveAuthorizedDriverAccount(mapped, authenticatedUser.uid);

    return NextResponse.json({ account: mapStripeAccountSummary(account, "driver", driver.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

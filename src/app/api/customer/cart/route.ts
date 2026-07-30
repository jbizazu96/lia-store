/*
|--------------------------------------------------------------------------
| Customer Cart API
|--------------------------------------------------------------------------
|
| Browser cart state calls this API instead of Firestore directly. Identity
| always comes from the verified Firebase ID token, never from a user ID sent
| by the browser.
|
*/

import {
  NextResponse,
} from "next/server";

import {
  getFirebaseAdminAuth,
} from "@/lib/firebaseAdmin";
import {
  CustomerProfileAuthorizationError,
  requireCustomerProfileOwner,
} from "@/services/user/serverCustomerProfileAuthorizationService";
import {
  clearCustomerCart,
  loadCustomerCart,
  normalizeCustomerCartItems,
  saveCustomerCart,
} from "@/services/cart/serverCustomerCartService";

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");

  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim() || null
    : null;
}

async function requireAuthenticatedCustomer(request: Request) {
  const token = getBearerToken(request);

  if (!token) {
    throw new CustomerProfileAuthorizationError(
      "Sign in again before managing your cart."
    );
  }

  const decodedToken = await getFirebaseAdminAuth().verifyIdToken(token, true);

  return requireCustomerProfileOwner(decodedToken.uid);
}

function errorResponse(error: unknown) {
  if (error instanceof CustomerProfileAuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof Error && error.message) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error("Customer cart request failed:", error);

  return NextResponse.json(
    { error: "The cart request could not be completed." },
    { status: 500 }
  );
}

export async function GET(request: Request) {
  try {
    const { userId } = await requireAuthenticatedCustomer(request);

    return NextResponse.json({
      items: await loadCustomerCart(userId),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { userId } = await requireAuthenticatedCustomer(request);
    const input = await request.json() as { items?: unknown };
    const items = normalizeCustomerCartItems(input.items);

    await saveCustomerCart(userId, items);

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = await requireAuthenticatedCustomer(request);

    await clearCustomerCart(userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}

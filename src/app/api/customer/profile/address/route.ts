/*
|--------------------------------------------------------------------------
| Customer Delivery Address API
|--------------------------------------------------------------------------
|
| Reads and writes only the authenticated customer's default address. The
| server verifies each submitted address before storing its coordinates.
|
*/

import {
  NextResponse,
} from "next/server";

import {
  FieldValue,
} from "firebase-admin/firestore";

import {
  getFirebaseAdminAuth,
} from "@/lib/firebaseAdmin";
import {
  verifyCustomerAddress,
} from "@/services/delivery/serverCustomerAddressService";
import {
  CustomerProfileAuthorizationError,
  requireCustomerProfileOwner,
} from "@/services/user/serverCustomerProfileAuthorizationService";

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
      "Sign in again before managing your delivery address."
    );
  }

  const decodedToken = await getFirebaseAdminAuth().verifyIdToken(token, true);

  return requireCustomerProfileOwner(decodedToken.uid);
}

function errorResponse(error: unknown) {
  if (error instanceof CustomerProfileAuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(
    { error: "The delivery address could not be updated." },
    { status: 500 }
  );
}

export async function PUT(request: Request) {
  try {
    const { userReference } = await requireAuthenticatedCustomer(request);
    const input = await request.json() as {
      street?: string;
      city?: string;
      state?: string;
      zip?: string;
    };
    const address = await verifyCustomerAddress({
      street: input.street ?? "",
      city: input.city ?? "",
      state: input.state ?? "",
      zip: input.zip ?? "",
    });
    const defaultAddressReference = userReference.collection("addresses").doc("default");

    await Promise.all([
      userReference.update({
        defaultAddress: address,
        updatedAt: FieldValue.serverTimestamp(),
      }),
      defaultAddressReference.set({
        ...address,
        isDefault: true,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true }),
    ]);

    return NextResponse.json({ defaultAddress: address });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { userReference } = await requireAuthenticatedCustomer(request);

    await Promise.all([
      userReference.update({
        defaultAddress: null,
        updatedAt: FieldValue.serverTimestamp(),
      }),
      userReference.collection("addresses").doc("default").delete(),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}

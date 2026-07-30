/*
|--------------------------------------------------------------------------
| Customer Profile API
|--------------------------------------------------------------------------
|
| Provides the customer-profile boundary between browser UI and Firebase
| Admin. The API returns only profile-safe data and never accepts a user ID
| from the client.
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
  getFirebaseAdminFirestore,
  getFirebaseAdminStorage,
} from "@/lib/firebaseAdmin";
import {
  CustomerProfileAuthorizationError,
  requireCustomerProfileOwner,
} from "@/services/user/serverCustomerProfileAuthorizationService";

const supportedLanguages = new Set([
  "English",
  "French",
  "Swahili",
]);

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
      "Sign in again before managing your profile."
    );
  }

  const decodedToken = await getFirebaseAdminAuth().verifyIdToken(token, true);

  return requireCustomerProfileOwner(decodedToken.uid);
}

function profileResponse(data: FirebaseFirestore.DocumentData) {
  const address = data.defaultAddress;
  const hasAddress =
    address &&
    typeof address === "object" &&
    typeof address.street === "string" &&
    typeof address.city === "string" &&
    typeof address.state === "string" &&
    typeof address.zip === "string" &&
    typeof address.latitude === "number" &&
    typeof address.longitude === "number" &&
    typeof address.formattedAddress === "string";

  return {
    displayName: typeof data.displayName === "string" ? data.displayName : "",
    email: typeof data.email === "string" ? data.email : "",
    phone: typeof data.phone === "string" ? data.phone : "",
    language: supportedLanguages.has(data.language) ? data.language : "English",
    profileImageUrl:
      typeof data.profileImageUrl === "string" ? data.profileImageUrl : "",
    profileImageStatus:
      data.profileImageStatus === "processing" ||
      data.profileImageStatus === "ready" ||
      data.profileImageStatus === "failed"
        ? data.profileImageStatus
        : "idle",
    defaultAddress: hasAddress
      ? {
          street: address.street,
          city: address.city,
          state: address.state,
          zip: address.zip,
          latitude: address.latitude,
          longitude: address.longitude,
          formattedAddress: address.formattedAddress,
        }
      : null,
  };
}

function errorResponse(error: unknown) {
  if (error instanceof CustomerProfileAuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  console.error("Customer profile request failed:", error);

  return NextResponse.json(
    { error: "The profile request could not be completed." },
    { status: 500 }
  );
}

export async function GET(request: Request) {
  try {
    const { userData } = await requireAuthenticatedCustomer(request);

    return NextResponse.json(profileResponse(userData));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { userId, userReference, userData } =
      await requireAuthenticatedCustomer(request);
    const input = await request.json() as {
      displayName?: unknown;
      phone?: unknown;
      language?: unknown;
    };
    const displayName =
      typeof input.displayName === "string" ? input.displayName.trim() : "";
    const phone = typeof input.phone === "string" ? input.phone.trim() : "";
    const language =
      typeof input.language === "string" && supportedLanguages.has(input.language)
        ? input.language
        : typeof userData.language === "string" && supportedLanguages.has(userData.language)
          ? userData.language
          : "English";

    if (!displayName || displayName.length > 80) {
      return NextResponse.json(
        { error: "Enter a display name between 1 and 80 characters." },
        { status: 400 }
      );
    }

    if (!phone || phone.length > 32) {
      return NextResponse.json(
        { error: "Enter a valid phone number." },
        { status: 400 }
      );
    }

    await Promise.all([
      userReference.update({
        displayName,
        phone,
        language,
        updatedAt: FieldValue.serverTimestamp(),
      }),
      getFirebaseAdminAuth().updateUser(userId, { displayName }),
    ]);

    return NextResponse.json(
      profileResponse({
        ...userData,
        displayName,
        phone,
        language,
      })
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId, userReference } = await requireAuthenticatedCustomer(request);
    const firestore = getFirebaseAdminFirestore();
    const addresses = await userReference.collection("addresses").get();

    /* Keep the authenticated profile intact when Storage cleanup fails. */
    await getFirebaseAdminStorage()
      .bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)
      .deleteFiles({
        prefix: `users/${userId}/images/`,
        force: true,
      });

    const batch = firestore.batch();

    for (const address of addresses.docs) {
      batch.delete(address.ref);
    }

    batch.delete(userReference);
    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}

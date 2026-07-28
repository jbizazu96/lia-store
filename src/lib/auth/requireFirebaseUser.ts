/*
  Firebase server authentication helper.

  Protected Next.js API routes use this helper to verify the Firebase
  ID token sent by the browser.

  Expected request header:

  Authorization: Bearer <firebase-id-token>

  Important distinction:

  Authentication answers:
  "Who is making this request?"

  Authorization answers:
  "Is this authenticated user allowed to perform this action?"

  This file handles authentication only.

  Future Stripe routes must still confirm that the authenticated user
  owns the store they are attempting to connect.
*/

import "server-only";

import type {DecodedIdToken} from "firebase-admin/auth";

import {getFirebaseAdminAuth} from "@/lib/firebaseAdmin";


/*
  Predictable error codes used by API route handlers.

  Route handlers can safely translate these errors into HTTP 401
  responses without exposing Firebase's internal error details.
*/
export type FirebaseAuthenticationErrorCode =
  | "MISSING_AUTHORIZATION_HEADER"
  | "INVALID_AUTHORIZATION_HEADER"
  | "INVALID_ID_TOKEN";


/*
  Custom error representing an authentication failure.

  We avoid returning raw Firebase Admin errors to the browser because
  they can expose implementation details that clients do not need.
*/
export class FirebaseAuthenticationError extends Error {
  readonly code: FirebaseAuthenticationErrorCode;

  constructor(
    code: FirebaseAuthenticationErrorCode,
    message: string
  ) {
    super(message);

    this.name = "FirebaseAuthenticationError";
    this.code = code;
  }
}


/*
  Extract the Firebase ID token from the Authorization header.

  Valid format:

  Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
*/
function getBearerToken(request: Request): string {
  const authorizationHeader = request.headers.get("authorization");

  if (!authorizationHeader) {
    throw new FirebaseAuthenticationError(
      "MISSING_AUTHORIZATION_HEADER",
      "Authentication is required."
    );
  }

  /*
    Split on whitespace so the parser safely handles one or more spaces
    between "Bearer" and the token.
  */
  const [scheme, token, ...extraParts] =
    authorizationHeader.trim().split(/\s+/);

  /*
    Reject malformed values such as:

    Authorization: Basic ...
    Authorization: Bearer
    Authorization: Bearer token extra-value
  */
  const isValidBearerHeader =
    scheme?.toLowerCase() === "bearer" &&
    Boolean(token) &&
    extraParts.length === 0;

  if (!isValidBearerHeader) {
    throw new FirebaseAuthenticationError(
      "INVALID_AUTHORIZATION_HEADER",
      "The Authorization header must use the Bearer token format."
    );
  }

  return token;
}


/*
  Verify the authenticated Firebase user.

  The second verifyIdToken argument is true, which tells Firebase Admin
  to check whether the token was revoked or the user was disabled.

  This requires an additional Firebase Authentication lookup, but it is
  appropriate for sensitive financial operations such as:

  - Creating Stripe connected accounts
  - Creating onboarding links
  - Viewing payout details
  - Issuing refunds
  - Changing payment settings
*/
export async function requireFirebaseUser(
  request: Request
): Promise<DecodedIdToken> {
  const idToken = getBearerToken(request);

  try {
    const decodedToken = await getFirebaseAdminAuth().verifyIdToken(
      idToken,
      true
    );

    /*
      Firebase ID tokens should always contain a UID.

      We still validate it explicitly so downstream authorization code
      never receives an empty user identifier.
    */
    if (!decodedToken.uid) {
      throw new FirebaseAuthenticationError(
        "INVALID_ID_TOKEN",
        "The authenticated user is invalid."
      );
    }

    return decodedToken;
  } catch (error: unknown) {
    /*
      Preserve authentication errors intentionally created above.
    */
    if (error instanceof FirebaseAuthenticationError) {
      throw error;
    }

    /*
      Log the original server error for diagnostics.

      Do not return this internal error object to the browser.
    */
    console.error("Firebase ID token verification failed:", error);

    throw new FirebaseAuthenticationError(
      "INVALID_ID_TOKEN",
      "Your session is invalid or has expired. Please sign in again."
    );
  }
}


/*
  Type guard used by route handlers.

  Example:

  try {
    const user = await requireFirebaseUser(request);
  } catch (error) {
    if (isFirebaseAuthenticationError(error)) {
      return Response.json(
        {error: error.message},
        {status: 401}
      );
    }

    throw error;
  }
*/
export function isFirebaseAuthenticationError(
  error: unknown
): error is FirebaseAuthenticationError {
  return error instanceof FirebaseAuthenticationError;
}
/*
  Central Firebase Admin configuration for the Next.js server.

  This file provides trusted server-side access to:

  - Firebase Authentication
  - Firestore

  Future Stripe API routes will use Firebase Admin to:

  1. Verify the Firebase ID token sent by the browser.
  2. Obtain the authenticated user's trusted UID.
  3. Confirm that the user owns the requested store.
  4. Read and update Stripe Connect information in Firestore.

  Important:
  Firebase Admin bypasses normal client-side Firestore security rules.

  Every server operation must therefore perform its own authorization
  checks before reading or modifying protected records.
*/

import "server-only";

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import {getAuth, type Auth} from "firebase-admin/auth";
import {
  getFirestore,
  type Firestore,
} from "firebase-admin/firestore";


/*
  Read the optional service-account environment variables.

  These values are useful when the Next.js app runs outside Google's
  managed infrastructure, such as on Vercel.

  Do not prefix any of these variables with NEXT_PUBLIC_.
*/
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY;
const firestoreDatabaseId = "default";


/*
  Convert escaped newline characters from an environment variable
  back into real newline characters.

  Hosting providers commonly store a private key on one line:

  -----BEGIN PRIVATE KEY-----\nABC...\n-----END PRIVATE KEY-----

  Firebase expects the restored multiline version.
*/
function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, "\n");
}


/*
  Determine whether all explicit service-account environment variables
  are available.

  We require the complete set. A partial credential configuration could
  produce confusing authentication failures.
*/
function hasExplicitServiceAccountCredentials(): boolean {
  return Boolean(
    firebaseProjectId &&
      firebaseClientEmail &&
      firebasePrivateKey
  );
}


/*
  Create or reuse the Firebase Admin application.

  Next.js development mode can reload modules multiple times.

  Calling initializeApp repeatedly would create duplicate Admin apps,
  so we always reuse the existing app when one is already initialized.
*/
function getFirebaseAdminApp(): App {
  const existingApp = getApps()[0];

  if (existingApp) {
    return existingApp;
  }

  /*
    When explicit service-account credentials are available, use them.

    This is typically used by a non-Google hosting environment.
  */
  if (hasExplicitServiceAccountCredentials()) {
    return initializeApp({
      credential: cert({
        projectId: firebaseProjectId!,
        clientEmail: firebaseClientEmail!,
        privateKey: normalizePrivateKey(firebasePrivateKey!),
      }),
    });
  }

  /*
    Otherwise, use Google Application Default Credentials.

    This works automatically in supported Google environments such as:

    - Firebase App Hosting
    - Cloud Run
    - App Engine
    - Cloud Functions

    It can also work locally when GOOGLE_APPLICATION_CREDENTIALS points
    to a securely stored service-account JSON file.
  */
  return initializeApp({
    credential: applicationDefault(),

    /*
      Supplying the project ID when available helps Firebase Admin
      identify the correct Firebase project.

      The public Firebase project ID is acceptable here because it is
      not a secret.
    */
    projectId:
      firebaseProjectId ??
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}


/*
  Return the trusted Firebase Admin Authentication service.

  Future API routes will use:

  const decodedToken =
    await getFirebaseAdminAuth().verifyIdToken(idToken);

  The decoded token contains the verified Firebase UID.
*/
export function getFirebaseAdminAuth(): Auth {
  return getAuth(getFirebaseAdminApp());
}


/*
  Return the trusted Firebase Admin Firestore service.

  This service bypasses Firestore client security rules, so callers must
  verify authorization before accessing or changing protected data.
*/
export function getFirebaseAdminFirestore(): Firestore {
  return getFirestore(
    getFirebaseAdminApp(),
    firestoreDatabaseId
  );
}

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getMessaging,
  isSupported,
  type Messaging,
} from "firebase/messaging";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";
import {
  ReCaptchaEnterpriseProvider,
  initializeAppCheck,
} from "firebase/app-check";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const firestoreDatabaseId = process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID || "default";

// Validate config
const missingConfig = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingConfig.length > 0) {
  throw new Error(
    `Missing Firebase config values: ${missingConfig.join(", ")}`
  );
}

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

/*
 * App Check rollout is intentionally opt-in until web, PWA, iOS, and Android
 * have registered providers. Supplying the public Enterprise site key starts
 * sending tokens immediately; backend strict enforcement is enabled later.
 */
const appCheckSiteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY;
const appCheckRuntime = globalThis as typeof globalThis & {
  __liaAppCheckInitialized?: boolean;
};
if (
  typeof window !== "undefined" &&
  appCheckSiteKey &&
  !appCheckRuntime.__liaAppCheckInitialized
) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
  appCheckRuntime.__liaAppCheckInitialized = true;
}

// Export Firebase instances
export const auth = getAuth(app);
export const db = getFirestore(app, firestoreDatabaseId);
export const functions = getFunctions(app);
export const storage = getStorage(app);

/*
|--------------------------------------------------------------------------
| Firebase Cloud Messaging
|--------------------------------------------------------------------------
|
| Messaging is only available in supported browsers.
| We export an async helper so the rest of the app
| never has to worry about browser support.
|
*/

export async function getFirebaseMessaging():
  Promise<Messaging | null> {

  if (!(await isSupported())) {
    return null;
  }

  return getMessaging(app);

}

// Export app as default
export default app;

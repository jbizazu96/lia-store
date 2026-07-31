
import Stripe from "stripe";

import {
  defineSecret,
} from "firebase-functions/params";
import { accountDeletionScheduler } from "./accountDeletion/accountDeletionScheduler";
import { requestAccountDeletion } from "./callable/requestAccountDeletion";
import {
  initializeUserProfile,
} from "./callable/initializeUserProfile";
import { driverApproved } from "./triggers/driverApproved";
import * as admin from "firebase-admin";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler"; 
import {getFirestore} from "firebase-admin/firestore";
import { createShipdayOrder } from "./orders/createShipdayOrder";
import { shipdayWebhook } from "./webhooks/shipdayWebhook";
import { stripeConnectWebhook } from "./webhooks/stripeConnectWebhook";
import { syncCustomerOrders } from "./delivery/syncCustomerOrders";
import { syncStoreOrders } from "./delivery/syncStoreOrders";
import { acceptOrder } from "./orders/acceptOrder";
import { orderStatusChanged } from "./triggers/orderStatusChanged";
import { syncShipdayDeliveries } from "./scheduler/syncShipdayDeliveries";
import { createOrder } from "./orders/createOrder";
import {
  prepareCheckoutPayment,
} from "./payment/prepareCheckoutPayment";
import {
  getStoreDeliveryRoutes,
} from "./delivery/getStoreDeliveryRoutes";
export {
  getDriverWorkspaceEntry,
  getDriverWorkspaceSummary,
  getDriverWorkspacePayments,
  getDriverWorkspaceNotifications,
  markDriverWorkspaceNotificationRead,
  clearDriverWorkspaceNotifications,
  submitDriverDocumentReplacement,
  updateDriverWorkspaceProfile,
} from "./callable/driverWorkspace";
export {
  clearCustomerCart,
  getCustomerCart,
  saveCustomerCart,
} from "./callable/customerCart";
export { processStoreImage } from "./images/processStoreImage";
export { processDriverImage } from "./images/processDriverImage";
export {
  processCustomerProfileImage,
} from "./images/processCustomerProfileImage";


/*
  Initialize the Firebase Admin SDK once.

  Cloud Functions uses the Admin SDK because it runs
  on the server and can safely update protected data.
*/
/*
  Some exported modules initialize Admin while they are being loaded.
  Guard this call so module-import order can never initialize the default
  Firebase app twice.
*/
if (admin.apps.length === 0) {
  admin.initializeApp();
}

/*
  This project uses a Firestore database with the ID "default".

  The frontend also passes this same database ID in src/lib/firebase.ts.
  Keeping both sides pointed at the same database prevents writes from
  going to a different Firestore database by mistake.
*/
const db = getFirestore("default");

/*
  Stripe secret used by the account deletion scheduler.

  The secret is injected by Firebase Secret Manager only into functions
  that explicitly declare it in their `secrets` configuration.
*/
const stripeSecretKey =
  defineSecret(
    "STRIPE_SECRET_KEY"
  );

/*
  FUNCTION 1: syncEmailVerification (Callable Function)

  This function is called by the frontend after a user clicks their email
  verification link.

  Flow:
  1. Frontend applies the action code (applyActionCode)
  2. Frontend calls this function as the authenticated user
  3. This function verifies that user's email in Firebase Auth
  4. Updates Firestore to mark emailVerified: true

  This is the primary method for syncing verification status.
*/
export const syncEmailVerification = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  async (request) => {
    // Check authentication
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to call this function."
      );
    }

    try {
      /*
        Only synchronize the authenticated caller. Accepting an email from
        the browser would let one signed-in user target another profile.
      */
      const user = await admin.auth().getUser(request.auth.uid);

      // Double-check that the email is actually verified in Firebase Auth
      if (!user.emailVerified) {
        throw new HttpsError(
          "failed-precondition",
          "Email has not been verified in Firebase Auth yet."
        );
      }

      // Update Firestore
      await db
        .collection("users")
        .doc(request.auth.uid)
        .update({
          emailVerified: true,
          emailVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      console.log(`✅ Firestore updated for user: ${user.uid} (${user.email})`);

      return {
        success: true,
        uid: user.uid,
        email: user.email,
        emailVerified: true,
        updatedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Error in syncEmailVerification:", error);

      // Handle specific Firebase Auth errors
      const err = error as {code?: string; message?: string};
      if (err.code === "auth/user-not-found") {
        throw new HttpsError(
          "not-found",
          "No user found with this email address."
        );
      }

      // Re-throw other errors
      throw new HttpsError(
        "internal",
        err.message || "Failed to sync email verification status."
      );
    }
  }
);

/*
  FUNCTION 2: checkEmailVerification (Utility)

  This is a utility function to check if a user's email is verified.
  Useful for debugging or manual verification checks.
*/
export const checkEmailVerification = onCall(
  {
    region: "us-central1",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be logged in.");
    }

    const uid = request.auth.uid;

    try {
      const user = await admin.auth().getUser(uid);

      // Get Firestore data
      const userDoc = await db.collection("users").doc(uid).get();
      const userData = userDoc.exists ? userDoc.data() : null;

      return {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
        firestoreData: userData,
        firestoreEmailVerified: userData?.emailVerified || false,
        isSynced: user.emailVerified === userData?.emailVerified,
      };
    } catch (error) {
      const err = error as {message?: string};
      throw new HttpsError(
        "internal",
        err.message || "Failed to check verification status."
      );
    }
  }
);

/*
  FUNCTION 3: resendVerificationEmail (Optional)

  Allows users to request a new verification email.
*/
export const resendVerificationEmail = onCall(
  {
    region: "us-central1",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be logged in.");
    }

    const uid = request.auth.uid;

    try {
      const user = await admin.auth().getUser(uid);

      if (user.emailVerified) {
        throw new HttpsError(
          "failed-precondition",
          "Email is already verified."
        );
      }

      // Generate a new verification link
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const link = await admin.auth().generateEmailVerificationLink(
        user.email as string,
        {
          url: `${frontendUrl}/verify-email`,
          handleCodeInApp: false,
        }
      );

      console.log(`📧 Verification link generated for ${user.email}: ${link}`);

      return {
        success: true,
        email: user.email,
        message: "Verification email sent. Please check your inbox.",
      };
    } catch (error) {
      console.error("❌ Error resending verification:", error);
      const err = error as {message?: string};
      throw new HttpsError(
        "internal",
        err.message || "Failed to resend verification email."
      );
    }
  }
);

/*
  FUNCTION 4: setEmailVerifiedManually (Admin Only)

  This is an admin function to manually set emailVerified status.
  Use this for testing or support purposes only.
*/
export const setEmailVerifiedManually = onCall(
  {
    region: "us-central1",
  },
  async (request) => {
    // Only allow admins to use this function
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be logged in.");
    }

    // Check if user is admin (you'll need to implement this check)
    // For now, we'll skip the admin check, but you should add it
    const {uid, emailVerified} = request.data;

    if (!uid) {
      throw new HttpsError(
        "invalid-argument",
        "User UID is required."
      );
    }

    try {
      // Update Firestore
      const updateData: {
        emailVerified: boolean;
        emailVerifiedAt: admin.firestore.FieldValue | null;
      } = {
        emailVerified: emailVerified || false,
        emailVerifiedAt: emailVerified
          ? admin.firestore.FieldValue.serverTimestamp()
          : null,
      };

      await db.collection("users").doc(uid).update(updateData);

      console.log(
        `🔧 Manual update: emailVerified=${emailVerified} for user: ${uid}`
      );

      return {
        success: true,
        uid: uid,
        emailVerified: emailVerified || false,
      };
    } catch (error) {
      console.error("❌ Error in manual update:", error);
      const err = error as {message?: string};
      throw new HttpsError(
        "internal",
        err.message || "Failed to update verification status."
      );
    }
  }
);

/*
  FUNCTION 5: cleanupExpiredCarts (Scheduled Function - v2)

  Automatically deletes expired carts from Firestore.
  Runs every 6 hours to clean up carts older than 48 hours.

  Carts are stored in the "carts" collection with an "expiresAt" field.
  This function removes any cart where expiresAt < current time.
*/
export const cleanupExpiredCarts = onSchedule(
  {
    schedule: "every 6 hours",
    region: "us-central1",
    timeZone: "America/Chicago", // Optional: set your timezone
    retryCount: 3,
    maxRetrySeconds: 60,
  },
  async () => {
    const now = new Date();
    console.log(`🧹 Starting cart cleanup at ${now.toISOString()}`);

    try {
      // Query all carts where expiresAt is in the past
      const cartsRef = db.collection("carts");
      const expiredCarts = await cartsRef
        .where("expiresAt", "<", now)
        .get();

      if (expiredCarts.empty) {
        console.log("✅ No expired carts to clean up.");
        return;
      }

      // Delete expired carts in batches
      const batch = db.batch();
      let deletedCount = 0;

      expiredCarts.forEach((doc) => {
        batch.delete(doc.ref);
        deletedCount++;
      });

      await batch.commit();
      console.log(`✅ Cleaned up ${deletedCount} expired carts.`);
    } catch (error) {
      console.error("❌ Error cleaning up expired carts:", error);
    }
  }
);

export { createShipdayOrder };
export { acceptOrder };
export {
  updateOrderStatus,
} from "./orders/updateOrderStatus";
export { shipdayWebhook };
export { stripeConnectWebhook };
export {
  stripePaymentWebhook,
} from "./webhooks/stripePaymentWebhook";
export { syncCustomerOrders };
export { syncStoreOrders };
export { orderStatusChanged };
export {
  productCustomerNotifications,
} from "./triggers/productCustomerNotifications";
export {
  storeCustomerNotifications,
} from "./triggers/storeCustomerNotifications";
export { syncShipdayDeliveries };
export { remindStoreOrders } from "./scheduler/remindStoreOrders";
export { createOrder };
export {
  prepareCheckoutPayment,
};
export {
  getStoreDeliveryRoutes,
};
export {
  processProductImage,
} from "./images/processProductImage";
export {
  deleteProductImages,
} from "./images/deleteProductImages";
export {
  deleteProductGalleryImage,
} from "./images/deleteProductGalleryImage";
export {
  pollClaidImageJobs,
} from "./claid/pollClaidImageJobs";
export { driverApproved };
export {
  syncShipdayCarriers,
} from "./scheduler/syncShipdayCarriers";
export {
  deleteDriverAccount,
} from "./callable/deleteDriverAccount";
export {
  requestAccountDeletion,
};
export {
  initializeUserProfile,
};
export const processAccountDeletionRequests =
  onSchedule(
    {
      schedule: "every 1 minutes",
      region: "us-central1",
      memory: "512MiB",
      timeoutSeconds: 540,

      secrets: [
        stripeSecretKey,
      ],
    },
    async () => {
      console.log(
        "Starting account deletion scheduler..."
      );

      const stripe =
        new Stripe(
          stripeSecretKey.value()
        );

      await accountDeletionScheduler.run({
        stripe,
      });

      console.log(
        "Account deletion scheduler completed."
      );
    }
  );

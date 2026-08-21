
import Stripe from "stripe";

export {cleanupEmailJobs, deliverQueuedEmail, retryQueuedEmails} from "./email/resendEmailDelivery";
export {resendEmailWebhook} from "./email/resendWebhook";
export {sendStoreInventoryEmailDigest} from "./email/inventoryEmailDigest";
export {orderTransactionalEmails} from "./email/transactionalEmailEvents";
export {requestPasswordResetEmail, requestVerificationEmail} from "./callable/authEmail";

import {
  defineSecret,
} from "firebase-functions/params";
import { accountDeletionScheduler } from "./accountDeletion/accountDeletionScheduler";
import {
  cancelAccountDeletion,
  requestAccountDeletion,
} from "./callable/requestAccountDeletion";
import {
  initializeUserProfile,
} from "./callable/initializeUserProfile";
import { driverApproved } from "./triggers/driverApproved";
export {
  storeWorkspaceStatusSync,
} from "./triggers/storeWorkspaceStatusSync";
export {
  driverWorkspaceStatusSync,
} from "./triggers/driverWorkspaceStatusSync";
export {
  storeEarningNotifications,
} from "./triggers/storeEarningNotifications";
export {
  storeStripeStatusNotifications,
} from "./triggers/storeStripeStatusNotifications";
import * as admin from "firebase-admin";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler"; 
import {getFirestore} from "firebase-admin/firestore";
import {requireActiveAdmin} from "./admin/adminAuthorizationService";
import { shipdayWebhook } from "./webhooks/shipdayWebhook";
import { stripeConnectWebhook } from "./webhooks/stripeConnectWebhook";
import { syncCustomerOrders } from "./delivery/syncCustomerOrders";
import { syncStoreOrders } from "./delivery/syncStoreOrders";
import { orderStatusChanged } from "./triggers/orderStatusChanged";
import { syncShipdayDeliveries } from "./scheduler/syncShipdayDeliveries";
import {
  prepareCheckoutPayment,
} from "./payment/checkout/prepareCheckoutPayment";
import {
  cleanupDeliveryRouteCache,
  getStoreDeliveryRoutes,
} from "./delivery/getStoreDeliveryRoutes";
export {
  createDriverStripeOnboardingLink,
  createOrRetrieveDriverStripeAccount,
  getDriverStripeAccountStatus,
} from "./callable/driverStripeConnect";
export {
  completeDriverOnboarding,
  getDriverOnboardingDraft,
  prepareDriverImageUpload,
  saveDriverAddressAndServiceArea,
  saveDriverAgreement,
  saveDriverDocuments,
  saveDriverPersonalInformation,
  saveDriverVehicleInformation,
} from "./callable/driverOnboarding";
export {
  getDriverWorkspaceEntry,
  reopenRejectedDriverApplication,
  getDriverWorkspaceSummary,
  getDriverWorkspacePayments,
  getDriverWorkspaceNotifications,
  markDriverWorkspaceNotificationRead,
  markAllDriverWorkspaceNotificationsRead,
  clearDriverWorkspaceNotifications,
  submitDriverDocumentReplacement,
  updateDriverWorkspaceProfile,
} from "./callable/driverWorkspace";
export {
  getAdminWorkspaceEntry,
  getAdminWorkspaceOverview,
  getAdminStoreApplications,
  getAdminDriverApplications,
  getAdminStoreApplication,
  getAdminDriverApplication,
  decideAdminApplicationDocument,
  decideAdminApplication,
  setAdminDriverApprovedRadius,
  setAdminStoreApproval,
  setAdminDriverApproval,
  setAdminStoreSuspension,
  setAdminDriverSuspension,
  activateAdminStore,
} from "./callable/adminWorkspace";
export {
  addAdminDeliveryZoneCity,
  backfillAdminDeliveryZoneAssignments,
  createAdminDeliveryZone,
  deleteAdminDeliveryZone,
  getAdminDeliveryZonePricing,
  getAdminDeliveryZones,
  removeAdminDeliveryZoneCity,
  resetAdminDeliveryZonePricing,
  saveAdminDeliveryZonePricing,
  setAdminAccountZoneAssignment,
  updateAdminDeliveryZone,
} from "./callable/adminDeliveryZones";
export {
  clearAdminNotifications,
  getAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
} from "./callable/adminNotifications";
export {
  createAdminUser,
  deleteAdminUser,
  getAdminUsers,
  updateAdminUser,
} from "./callable/adminUsers";
export {
  createAdminProductSizeUnit,
  createAdminProductCategory,
  deleteAdminProductSizeUnit,
  getAdminProductCategories,
  getAdminProductSizeUnits,
  getStoreProductSizeUnits,
  importAdminProductCategories,
  importAdminProductSizeUnits,
  updateAdminProductSizeUnit,
  updateAdminProductCategory,
  uploadAdminProductCategoryIcon,
} from "./callable/adminProductCategories";
export {
  decideAdminAccountDeletionRequest,
  getAdminAccountDeletionRequest,
  getAdminAccountDeletionRequests,
  retryAdminAccountDeletionRequest,
  reinstateAdminAccountDeletionRequest,
} from "./callable/adminAccountDeletion";
export {
  getAdminOrder,
  getAdminOrders,
} from "./callable/adminOrderOperations";
export {
  getAdminFinanceOverview,
  getAdminLiaFinanceReport,
} from "./callable/adminFinancialOperations";
export {
  getAdminCommissionSettings,
  getAdminMarketplacePricingPolicy,
  saveAdminDefaultDriverCommission,
  saveAdminMarketplacePricingPolicy,
  saveAdminDefaultStoreCommission,
  saveAdminStoreCommissionOverride,
} from "./callable/adminCommissionSettings";
export {
  getAdminStoreApplicationPolicy,
  saveAdminStoreApplicationPolicy,
} from "./callable/adminStoreApplicationSettings";
export {
  getAdminDriverApplicationPolicy,
  saveAdminDriverApplicationPolicy,
} from "./callable/adminDriverApplicationSettings";
export {
  getAdminOrderDeliveryPolicy,
  getOrderDeliveryPolicyForClient,
  saveAdminOrderDeliveryPolicy,
} from "./callable/adminOrderDeliverySettings";
export {
  decideAdminOrderZoneRequest,
  getAdminCustomer,
  getAdminCustomers,
  setAdminCustomerSuspension,
} from "./callable/adminCustomerManagement";
export {
  getAdminPlatformReport,
} from "./callable/adminPlatformReports";
export {
  backfillAdminPlatformDailyReports,
} from "./callable/adminPlatformReportBackfill";
export {
  getAdminAuditLogs,
} from "./callable/adminAuditLogs";
export {
  reindexAdminCatalogSearch,
} from "./callable/adminCatalogSearchReindex";
export {getMarketplacePricing} from "./callable/marketplacePricing";
export {
  cleanupClientErrorReports,
  reportClientError,
} from "./callable/clientErrorReports";
export {
  deleteAdminHomePromotion,
  getAdminHomePromotions,
  getCustomerHomePromotions,
  saveAdminHomePromotion,
} from "./callable/homePromotions";
export {
  adminAccountDeletionRequested,
  adminCustomerPaymentFailed,
  adminCustomerRefundClaimSubmitted,
  adminDriverApplicationSubmitted,
  adminLowStockProduct,
  adminNewCustomerCreated,
  adminPaymentTransferFailed,
  adminProductAdded,
  adminRefundRequested,
  adminRefundStatusChanged,
  adminStoreApplicationSubmitted,
  remindAdminDocumentExpirations,
  remindAdminDocumentReviews,
} from "./triggers/adminNotifications";
export {homePromotionCustomerNotifications} from "./triggers/homePromotionCustomerNotifications";
export {
  customerRefundClaimSubmissionNotification,
  customerRefundClaimDecisionNotification,
  customerRefundClaimPaymentNotification,
} from "./triggers/refundClaimNotifications";
export {
  clearCustomerCart,
  getCustomerCart,
  repeatCustomerOrder,
  saveCustomerCart,
} from "./callable/customerCart";
export {
  getCustomerStoreReview,
  submitCustomerStoreReview,
} from "./callable/customerStoreReviews";
export {
  getCustomerStoreCatalog,
  getCustomerStorePublicProfile,
} from "./callable/customerStoreCatalog";
export {
  getCustomerStoreProductPreview,
  getCustomerStoreProducts,
} from "./callable/customerStoreProducts";
export {
  getOwnedStoreProduct,
  getOwnedStoreProducts,
  getStoreInventoryAudit,
  mutateStoreProduct,
} from "./callable/storeProducts";
export {storeProductCategorySummarySync} from "./triggers/storeProductCategorySummary";
export {
  failStoreProductGalleryImageUpload,
  getOwnedStoreProductImages,
  prepareStoreProductGalleryImage,
} from "./callable/storeProductGallery";
export {
  beginCustomerProfileImageUpload,
  deleteCustomerDefaultAddress,
  getCustomerFavoriteStores,
  getCustomerProfile,
  saveCustomerRecentSearch,
  saveCustomerDefaultAddress,
  setCustomerStoreFavorite,
  updateCustomerNotificationPreferences,
  updateCustomerProfile,
} from "./callable/customerProfile";
export {
  getCurrentAccount,
} from "./callable/currentAccount";
export {getCustomerStartup} from "./callable/customerStartup";
export {getCustomerOrderMetrics, customerOrderMetricsSync} from "./callable/customerOrderMetrics";
export {acceptCustomerTerms, getCustomerTermsStatus} from "./callable/customerLegal";
export {
  archiveAdminLegalDocument,
  createAdminLegalDocumentDraft,
  deleteAdminLegalDocumentDraft,
  getAdminLegalDocuments,
  getPublicLegalDocument,
  publishAdminLegalDocument,
  updateAdminLegalDocumentDraft,
} from "./callable/legalDocuments";
export {
  acceptStoreMerchantAgreement,
  completeStoreOnboarding,
  ensureStoreOnboardingDraft,
  getStoreOnboardingDraft,
  reopenRejectedStoreApplication,
  saveStoreOnboardingBusinessInformation,
  saveStoreOnboardingOwner,
  saveStoreOnboardingSchedule,
  saveStoreOnboardingStoreInformation,
} from "./callable/storeOnboarding";
export {
  createOrRetrieveStoreStripeAccount,
  createStoreStripeOnboardingLink,
  getStoreStripeAccountStatus,
} from "./callable/storeStripeConnect";
export {
  getStoreWorkspaceEntry,
  getStoreWorkspaceDashboard,
  getStoreWorkspaceFinancials,
  getStoreWorkspaceAnalytics,
  getStoreWorkspacePayouts,
  getStoreWorkspaceOrder,
  getStoreWorkspaceOrders,
  getStoreWorkspaceSettings,
  getStoreSettingsAudit,
  saveStoreWorkspaceSchedule,
  saveStoreWorkspaceSettings,
} from "./callable/storeWorkspace";
export {
  uploadAdminStoreBrandingImage,
} from "./callable/adminStoreBranding";
export {
  deleteAdminStoreContract,
  finalizeAdminStoreContractUpload,
  getAdminStoreContractPreview,
  getAdminStoreContracts,
  getStoreOwnerContractPreview,
  getStoreOwnerContracts,
  prepareAdminStoreContractUpload,
} from "./callable/storeContracts";
export { processStoreImage } from "./images/processStoreImage";
export {remindOutOfStockProducts} from "./scheduler/remindOutOfStockProducts";
export {cleanupUserNotifications} from "./scheduler/cleanupUserNotifications";
export {
  storePublicProfileSync,
} from "./triggers/storePublicProfileSync";
export {
  productPublicGalleryImageSync,
  productPublicProfileSync,
  storeProductPublicVisibilitySync,
} from "./triggers/productPublicProfileSync";
export { processDriverImage } from "./images/processDriverImage";
export {
  processCustomerProfileImage,
} from "./images/processCustomerProfileImage";
export {
  marketplaceSettlementOnOrderCompleted,
} from "./triggers/marketplaceSettlementOnOrderCompleted";
export {
  platformCustomerDailyReport,
  platformOrderDailyReport,
} from "./triggers/platformDailyReports";
export {
  storeSettlementPerformanceSummarySync,
  storeRefundPerformanceSummarySync,
} from "./triggers/storePerformanceSummaries";

export {
  reconcileMarketplaceSettlements,
} from "./scheduler/reconcileMarketplaceSettlements";

export {
  processMarketplaceTransfers,
} from "./scheduler/processMarketplaceTransfers";

export {
  processMarketplaceRefunds,
} from "./scheduler/processMarketplaceRefunds";

export {
  processEligibleMarketplaceRefund,
} from "./triggers/processEligibleMarketplaceRefund";
export {storeCancelledOrderRefund} from "./triggers/storeCancelledOrderRefund";

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

      const userReference = db
        .collection("users")
        .doc(request.auth.uid);
      const userProfile = await userReference.get();

      /*
       * Master and staff administrators are intentionally provisioned only
       * under admins/{uid}. A verified administrator has nothing to sync in
       * users/{uid}; validate the admin record and return without creating an
       * ordinary application profile.
       */
      if (!userProfile.exists) {
        await requireActiveAdmin(request);
        return {
          success: true,
          uid: user.uid,
          email: user.email,
          emailVerified: true,
          updatedAt: new Date().toISOString(),
        };
      }

      // Update Firestore
      await userReference.update({
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

      if (error instanceof HttpsError) {
        throw error;
      }

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
      const frontendUrl = process.env.FRONTEND_URL || "https://www.liamarketplace.com";
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
  FUNCTION 4: cleanupExpiredCarts (Scheduled Function - v2)

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
export {
  prepareCheckoutPayment,
};
export {
  cleanupDeliveryRouteCache,
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
  cancelAccountDeletion,
  requestAccountDeletion,
};
export {
  beginCustomerRefundClaimEvidenceUpload,
  createCustomerRefundClaim,
  getCustomerRefundClaim,
} from "./callable/refundClaims";
export {
  decideAdminRefundClaim,
  getAdminRefundClaim,
  getAdminRefundClaims,
} from "./callable/adminRefundClaims";
export {
  createCustomerOrderSupportRequest,
  getCustomerOrderSupportRequest,
} from "./callable/orderSupport";
export {createCustomerOrderZoneRequest} from "./callable/orderZoneRequests";
export {
  getCustomerDeliveryProof,
} from "./callable/customerDeliveryProof";
export {
  deactivateNotificationDevice,
  getNotificationDeviceStatus,
  registerNotificationDevice,
  sendTestNotification,
} from "./callable/notificationDevice";
export {processUserNotificationBatch} from "./callable/userNotifications";
export {
  getAdminOrderSupportRequest,
  respondAdminOrderSupportRequest,
} from "./callable/adminOrderSupport";
export {
  createAccountSupportRequest,
  createPublicSupportRequest,
  getAdminAccountSupportRequests,
  respondAdminAccountSupportRequest,
} from "./callable/accountSupport";
export {accountSupportRequestCreated} from "./triggers/accountSupportNotifications";
export {
  orderSupportRequestCreated,
  orderSupportResponseNotification,
} from "./triggers/orderSupportNotifications";
export {
  orderSupportOrderInvestigationSync,
  paymentRefundOrderInvestigationSync,
  refundClaimOrderInvestigationSync,
} from "./triggers/orderInvestigationSync";
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

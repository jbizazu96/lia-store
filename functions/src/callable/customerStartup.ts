import * as admin from "firebase-admin";
import {getFirestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {loadCustomerCart} from "./customerCart";
import {
  customerFavoriteStoreIds,
  customerProfileResponse,
} from "./customerProfile";
import {
  getCurrentCustomerLegalDocuments,
  hasAcceptedCustomerLegalDocument,
} from "../legal/customerLegalConfig";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");

/**
 * One read model for the protected customer shell. It intentionally contains
 * only data that the same customer can already retrieve from the individual
 * profile, legal, cart, and favorite-store callables.
 */
export const getCustomerStartup = onCall(
  {region: "us-central1"},
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to continue.");
    }

    const uid = request.auth.uid;
    const user = await db.collection("users").doc(uid).get();
    const data = user.data();

    if (!user.exists || data?.uid !== uid || data.accountType !== "customer") {
      throw new HttpsError(
        "permission-denied",
        "This account is not authorized to access the customer app.",
      );
    }
    if (["deletion_pending", "deletion_processing"].includes(data.accountDeletionState)) {
      throw new HttpsError(
        "permission-denied",
        "Your account deletion request is under review. Customer account access is unavailable.",
      );
    }
    if (data.isActive === false) {
      throw new HttpsError(
        "permission-denied",
        "This customer account is currently suspended. Contact support for help.",
      );
    }

    const [documents, cartItems] = await Promise.all([
      getCurrentCustomerLegalDocuments(db),
      loadCustomerCart(uid),
    ]);

    const pendingDocuments = documents.filter((document) =>
      document.requiresAcceptance &&
      !hasAcceptedCustomerLegalDocument(data, uid, document)
    );

    return {
      accountType: "customer" as const,
      profile: customerProfileResponse(data),
      legal: {
        accepted: pendingDocuments.length === 0,
        documents,
        pendingDocuments,
      },
      cart: {items: cartItems},
      favoriteStores: {
        storeIds: customerFavoriteStoreIds(data.favoriteStoreIds),
      },
    };
  },
);

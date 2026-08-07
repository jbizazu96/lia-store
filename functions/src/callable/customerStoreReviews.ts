import * as admin from "firebase-admin";
import {
  FieldValue,
  getFirestore,
} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = getFirestore("default");

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function requireVerifiedDeliveredOrder(
  customerId: string,
  orderId: string,
) {
  if (!orderId || orderId.includes("/") || orderId.includes("\\")) {
    throw new HttpsError("invalid-argument", "A valid order is required.");
  }

  const [customer, order] = await Promise.all([
    db.collection("users").doc(customerId).get(),
    db.collection("orders").doc(orderId).get(),
  ]);
  const orderData = order.data() ?? {};
  const customerData = record(orderData.customer);
  const payment = record(orderData.payment);

  if (
    !customer.exists ||
    customer.data()?.accountType !== "customer" ||
    customer.data()?.isActive === false
  ) {
    throw new HttpsError("permission-denied", "This account cannot submit a store review.");
  }

  if (
    !order.exists ||
    text(customerData.uid) !== customerId ||
    orderData.checkoutStatus !== "confirmed" ||
    text(payment.status) !== "paid" ||
    orderData.status !== "completed"
  ) {
    throw new HttpsError("failed-precondition", "Reviews are available only after a verified delivery.");
  }

  const store = record(orderData.store);
  const storeId = text(store.id);
  if (!storeId) {
    throw new HttpsError("failed-precondition", "This order is missing its store.");
  }

  return {
    order,
    orderData,
    storeId,
    customerName: text(customerData.name) || "Customer",
  };
}

export const getCustomerStoreReview = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to view this review.");
    }

    const orderId = text(record(request.data).orderId);
    await requireVerifiedDeliveredOrder(request.auth.uid, orderId);
    const review = await db.collection("storeReviews").doc(orderId).get();

    if (!review.exists) {
      return { review: null };
    }

    const data = review.data() ?? {};
    return {
      review: {
        rating: typeof data.rating === "number" ? data.rating : 0,
        comment: text(data.comment),
      },
    };
  },
);

export const submitCustomerStoreReview = onCall(
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in to submit a review.");
    }

    const input = record(request.data);
    const orderId = text(input.orderId);
    const rating = input.rating;
    const comment = text(input.comment);

    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new HttpsError("invalid-argument", "Choose a rating from 1 to 5 stars.");
    }

    if (comment.length > 1_000) {
      throw new HttpsError("invalid-argument", "A review comment must be 1,000 characters or fewer.");
    }

    const verifiedOrder = await requireVerifiedDeliveredOrder(request.auth.uid, orderId);
    const reviewReference = db.collection("storeReviews").doc(orderId);
    const storeReference = db.collection("stores").doc(verifiedOrder.storeId);

    await db.runTransaction(async (transaction) => {
      const [existingReview, store] = await Promise.all([
        transaction.get(reviewReference),
        transaction.get(storeReference),
      ]);

      if (existingReview.exists) {
        throw new HttpsError("already-exists", "You have already reviewed this order.");
      }

      if (!store.exists) {
        throw new HttpsError("not-found", "This store is no longer available.");
      }

      const storeData = store.data() ?? {};
      const currentCount = typeof storeData.reviewCount === "number"
        ? Math.max(0, Math.floor(storeData.reviewCount))
        : 0;
      const currentRating = typeof storeData.rating === "number" && Number.isFinite(storeData.rating)
        ? storeData.rating
        : 0;
      const nextCount = currentCount + 1;
      const nextRating = Math.round(((currentRating * currentCount + rating) / nextCount) * 100) / 100;

      transaction.create(reviewReference, {
        id: reviewReference.id,
        orderId,
        storeId: verifiedOrder.storeId,
        customerId: request.auth?.uid,
        customerName: verifiedOrder.customerName,
        rating,
        comment,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.update(storeReference, {
        rating: nextRating,
        reviewCount: nextCount,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return { rating };
  },
);

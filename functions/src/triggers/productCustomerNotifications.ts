/*
|--------------------------------------------------------------------------
| Product Customer Notifications
|--------------------------------------------------------------------------
|
| - A new product is announced only after its front image is ready.
| - A promotion is announced when an active promotion is added to a product.
| - Notification markers are stored on the product document so repeated image
|   updates and function retries do not send duplicates.
|
*/

import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

import { customerStoreEvents } from "../events/customerStoreEvents";

interface PromotionData {
  id?: unknown;
  type?: unknown;
  isActive?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  discountPercentage?: unknown;
  discountAmount?: unknown;
}

function isActivePromotion(
  value: unknown,
  now: Date = new Date()
): value is PromotionData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const promotion = value as PromotionData;

  if (promotion.isActive === false) {
    return false;
  }

  const startsAt = typeof promotion.startsAt === "string"
    ? new Date(promotion.startsAt)
    : null;
  const endsAt = typeof promotion.endsAt === "string"
    ? new Date(promotion.endsAt)
    : null;

  if (startsAt && (Number.isNaN(startsAt.getTime()) || startsAt > now)) {
    return false;
  }

  if (endsAt && (Number.isNaN(endsAt.getTime()) || endsAt < now)) {
    return false;
  }

  return true;
}

function getPromotionId(
  promotion: PromotionData
): string {
  if (typeof promotion.id === "string" && promotion.id.trim()) {
    return promotion.id;
  }

  return [
    promotion.type,
    promotion.discountPercentage,
    promotion.discountAmount,
  ].join("-");
}

function getPromotionLabel(
  promotion: PromotionData
): string {
  if (
    promotion.type === "discount" &&
    typeof promotion.discountPercentage === "number" &&
    promotion.discountPercentage > 0
  ) {
    return `${promotion.discountPercentage}% off`;
  }

  if (
    promotion.type === "discount" &&
    typeof promotion.discountAmount === "number" &&
    promotion.discountAmount > 0
  ) {
    return `$${promotion.discountAmount.toFixed(2)} off`;
  }

  if (promotion.type === "bogo") {
    return "Buy One Get One";
  }

  if (promotion.type === "free_shipping") {
    return "Free delivery";
  }

  return "A special offer";
}

export const productCustomerNotifications = onDocumentWritten(
  {
    document: "products/{productId}",
    region: "us-central1",
    database: "default",
  },
  async (event) => {
    const afterSnapshot = event.data?.after;
    const beforeSnapshot = event.data?.before;

    if (!afterSnapshot?.exists) {
      return;
    }

    const productId = event.params.productId;
    const db = getFirestore("default");

    /*
     * Reserve a pending new-product announcement immediately at creation.
     * The same trigger will send it later when image processing marks the
     * product ready for customers.
     */
    if (!beforeSnapshot?.exists) {
      await afterSnapshot.ref.set({
        customerNotification: {
          newProductPending: true,
        },
      }, { merge: true });
      return;
    }

    const before = beforeSnapshot.data();
    const after = afterSnapshot.data();

    if (!before || !after) {
      return;
    }

    const storeId = typeof after.storeId === "string"
      ? after.storeId.trim()
      : "";
    const productName = typeof after.name === "string" && after.name.trim()
      ? after.name.trim()
      : "New product";

    if (!storeId) {
      console.error(`Product ${productId} has no store ID.`);
      return;
    }

    const storeSnapshot = await db.collection("stores").doc(storeId).get();
    const storeName = typeof storeSnapshot.data()?.name === "string"
      ? storeSnapshot.data()?.name
      : "your local store";
    const customerNotification = after.customerNotification as {
      newProductPending?: unknown;
      newProductImageId?: unknown;
      promotionId?: unknown;
    } | undefined;

    const notifications: Array<{
      kind: "newProduct" | "promotion";
      promotion?: PromotionData;
    }> = [];

    const primaryImageId = typeof after.primaryImageId === "string"
      ? after.primaryImageId
      : "ready";

    if (
      after.imageStatus === "ready" &&
      customerNotification?.newProductPending === true &&
      customerNotification.newProductImageId !== primaryImageId
    ) {
      notifications.push({ kind: "newProduct" });
    }

    const beforePromotionActive = isActivePromotion(before.promotion);
    const afterPromotion = isActivePromotion(after.promotion)
      ? after.promotion
      : null;
    const promotionId = afterPromotion
      ? getPromotionId(afterPromotion)
      : "";

    if (
      afterPromotion &&
      customerNotification?.promotionId !== promotionId &&
      (
        !beforePromotionActive ||
        (
          customerNotification?.newProductPending === true &&
          after.imageStatus === "ready"
        )
      )
    ) {
      notifications.push({ kind: "promotion", promotion: afterPromotion });
    }

    if (notifications.length === 0) {
      return;
    }

    /*
     * Reserve every notice before delivery. This prevents duplicate messages
     * when the Firestore trigger retries or receives a related image update.
     */
    await afterSnapshot.ref.set({
      customerNotification: {
        ...customerNotification,
        ...(notifications.some((notification) => notification.kind === "newProduct")
          ? {
            newProductPending: false,
            newProductImageId: primaryImageId,
            newProductSentAt: FieldValue.serverTimestamp(),
          }
          : {}),
        ...(notifications.some((notification) => notification.kind === "promotion")
          ? {
            promotionId,
            promotionSentAt: FieldValue.serverTimestamp(),
          }
          : {}),
      },
    }, { merge: true });

    await Promise.allSettled(
      notifications.map(async (notification) => {
        if (notification.kind === "newProduct") {
          await customerStoreEvents.newProduct(
            storeId,
            productId,
            productName,
            storeName
          );
          return;
        }

        await customerStoreEvents.newPromotion(
          productId,
          productName,
          storeName,
          getPromotionLabel(notification.promotion!)
        );
      })
    );
  }
);

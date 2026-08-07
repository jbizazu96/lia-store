/*
|--------------------------------------------------------------------------
| Home Promotion Customer Notifications
|--------------------------------------------------------------------------
|
| A newly active Admin home banner is announced once to customer accounts.
| The marker is written before delivery so retries and content edits cannot
| create duplicate customer notices.
|
*/

import {FieldValue} from "firebase-admin/firestore";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {customerStoreEvents} from "../events/customerStoreEvents";

type PromotionData = {
  title?: unknown;
  subtitle?: unknown;
  targetPath?: unknown;
  isActive?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  customerNotification?: {promotionAnnouncementSentAt?: unknown};
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isLive(data: PromotionData | undefined): boolean {
  if (!data || data.isActive !== true) return false;
  const now = Date.now();
  const start = text(data.startsAt);
  const end = text(data.endsAt);
  return (!start || new Date(start).getTime() <= now) &&
    (!end || new Date(end).getTime() > now);
}

export const homePromotionCustomerNotifications = onDocumentWritten(
  {document: "homePromotions/{promotionId}", region: "us-central1", database: "default"},
  async (event) => {
    const after = event.data?.after;
    const before = event.data?.before;
    if (!after?.exists) return;
    const afterData = after.data() as PromotionData;
    const beforeData = before?.data() as PromotionData | undefined;

    if (!isLive(afterData) || isLive(beforeData) ||
      afterData.customerNotification?.promotionAnnouncementSentAt) return;

    await after.ref.set({
      customerNotification: {promotionAnnouncementSentAt: FieldValue.serverTimestamp()},
    }, {merge: true});

    const title = text(afterData.title) || "New LIA promotion";
    const body = text(afterData.subtitle) || "A new marketplace promotion is available now.";
    const targetPath = text(afterData.targetPath) || "/home";
    await customerStoreEvents.newPlatformPromotion(title, body, targetPath);
  },
);

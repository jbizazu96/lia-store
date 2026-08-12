/*
|--------------------------------------------------------------------------
| Home Promotion Banners
|--------------------------------------------------------------------------
|
| Admins manage home-page promotion content through these protected
| callables. Customer reads receive only active, customer-safe banner data.
|
*/

import * as admin from "firebase-admin";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {requireAdminPermission} from "../admin/adminAuthorizationService";
import {writeAdminAuditLog} from "../admin/adminAuditLogService";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");
const THEMES = ["orange", "green", "blue", "purple"] as const;
type PromotionTheme = typeof THEMES[number];

function text(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function date(value: unknown, name: string): string | null {
  const input = text(value, 64);
  if (!input) return null;
  if (Number.isNaN(new Date(input).getTime())) {
    throw new HttpsError("invalid-argument", `${name} must be a valid date.`);
  }
  return new Date(input).toISOString();
}

function promotionData(value: unknown) {
  const input = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const title = text(input.title, 80);
  const subtitle = text(input.subtitle, 180);
  const ctaLabel = text(input.ctaLabel, 40) || "Shop now";
  const targetPath = text(input.targetPath, 240);
  const theme = text(input.theme, 20) as PromotionTheme;
  const startsAt = date(input.startsAt, "Start date");
  const endsAt = date(input.endsAt, "End date");
  const position = Number(input.position);

  if (!title || !subtitle || !THEMES.includes(theme) ||
    !Number.isInteger(position) || position < 0 || position > 1_000) {
    throw new HttpsError("invalid-argument", "Complete the banner title, message, theme, and position.");
  }
  if (targetPath && (!targetPath.startsWith("/") || targetPath.startsWith("//"))) {
    throw new HttpsError("invalid-argument", "Banner links must point to a path inside LIA.");
  }
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    throw new HttpsError("invalid-argument", "The end date must be after the start date.");
  }

  return {title, subtitle, ctaLabel, targetPath: targetPath || null, theme, startsAt, endsAt, position, isActive: input.isActive === true};
}

function toClient(id: string, data: Record<string, unknown>) {
  return {
    id,
    title: text(data.title, 80),
    subtitle: text(data.subtitle, 180),
    ctaLabel: text(data.ctaLabel, 40) || "Shop now",
    targetPath: text(data.targetPath, 240) || null,
    theme: THEMES.includes(data.theme as PromotionTheme) ? data.theme : "orange",
    startsAt: text(data.startsAt, 64) || null,
    endsAt: text(data.endsAt, 64) || null,
    position: typeof data.position === "number" ? data.position : 0,
    isActive: data.isActive === true,
  };
}

export const getAdminHomePromotions = onCall({region: "us-central1"}, async (request) => {
  await requireAdminPermission(request, "promotions");
  const snapshots = await db.collection("homePromotions").orderBy("position").limit(100).get();
  return {promotions: snapshots.docs.map((item) => toClient(item.id, item.data()))};
});

export const saveAdminHomePromotion = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "promotions", "write");
  const input = (request.data ?? {}) as {id?: unknown; promotion?: unknown};
  const id = text(input.id, 128);
  const promotion = promotionData(input.promotion);
  const reference = id ? db.collection("homePromotions").doc(id) : db.collection("homePromotions").doc();
  if (id && !(await reference.get()).exists) throw new HttpsError("not-found", "Promotion banner not found.");
  await reference.set({...promotion, updatedAt: FieldValue.serverTimestamp(), updatedBy: administrator.uid, ...(id ? {} : {createdAt: FieldValue.serverTimestamp(), createdBy: administrator.uid})}, {merge: true});
  await writeAdminAuditLog(administrator, {action: id ? "home_promotion.updated" : "home_promotion.created", targetType: "homePromotion", targetId: reference.id, details: {isActive: promotion.isActive, theme: promotion.theme, position: promotion.position}});
  return {id: reference.id};
});

export const deleteAdminHomePromotion = onCall({region: "us-central1"}, async (request) => {
  const administrator = await requireAdminPermission(request, "promotions", "write");
  const id = text((request.data as {id?: unknown} | undefined)?.id, 128);
  if (!id) throw new HttpsError("invalid-argument", "Promotion banner is required.");
  const reference = db.collection("homePromotions").doc(id);
  if (!(await reference.get()).exists) throw new HttpsError("not-found", "Promotion banner not found.");
  await reference.delete();
  await writeAdminAuditLog(administrator, {action: "home_promotion.deleted", targetType: "homePromotion", targetId: id});
  return {success: true};
});

export const getCustomerHomePromotions = onCall({region: "us-central1"}, async () => {
  const now = Date.now();
  const snapshots = await db.collection("homePromotions").orderBy("position").limit(100).get();
  const promotions = snapshots.docs.map((item) => toClient(item.id, item.data())).filter((promotion) =>
    promotion.isActive &&
    (!promotion.startsAt || new Date(promotion.startsAt).getTime() <= now) &&
    (!promotion.endsAt || new Date(promotion.endsAt).getTime() > now),
  ).slice(0, 30);
  return {promotions};
});

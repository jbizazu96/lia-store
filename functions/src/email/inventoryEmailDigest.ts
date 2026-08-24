import * as admin from "firebase-admin";
import {getFirestore} from "firebase-admin/firestore";
import {defineString} from "firebase-functions/params";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {enqueueEmail} from "./emailQueueService";
import {inventoryDigestEmail} from "./emailTemplates";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");
const appUrl = defineString("APP_URL", {default: "https://www.liamarketplace.com"});
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";

function chicagoDateParts(date: Date): {day: string; hour: number} {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23"}).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return {day: `${part("year")}-${part("month")}-${part("day")}`, hour: Number(part("hour"))};
}

function deliveryHours(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [9];
  return Array.from({length: count}, (_, index) => Math.round(9 + (index * 9) / (count - 1)));
}

export const sendStoreInventoryEmailDigest = onSchedule({schedule: "0 * * * *", region: "us-central1", timeZone: "America/Chicago"}, async () => {
  const policy = (await db.collection("settings").doc("productCatalog").get()).data() ?? {};
  const requestedFrequency = Number(policy.inventoryEmailsPerDay);
  const frequency = Number.isInteger(requestedFrequency) ? Math.min(4, Math.max(0, requestedFrequency)) : 1;
  const now = chicagoDateParts(new Date());
  if (!deliveryHours(frequency).includes(now.hour)) return;

  const products = await db.collection("products").where("isLowStock", "==", true).where("isArchived", "==", false).select("storeId", "name").get();
  const byStore = new Map<string, string[]>();
  for (const product of products.docs) {
    const storeId = text(product.data().storeId);
    if (!storeId) continue;
    const names = byStore.get(storeId) ?? [];
    names.push(text(product.data().name) || "Unnamed product");
    byStore.set(storeId, names);
  }
  await Promise.all([...byStore].map(async ([storeId, names]) => {
    const store = await db.collection("stores").doc(storeId).get();
    const data = store.data() ?? {};
    if (!store.exists || data.isApproved !== true || data.productStockNotifications === false || data.emailNotifications === false) return;
    const owner = await db.collection("users").doc(text(data.ownerId)).get();
    const email = text(owner.data()?.email) || text(data.email);
    names.sort((a, b) => a.localeCompare(b));
    const template = inventoryDigestEmail({storeName: text(data.name) || "Your store", productNames: names, url: `${appUrl.value().replace(/\/+$/, "")}/store/products?status=low_stock`});
    await enqueueEmail({dedupeKey: `store-inventory-digest:${storeId}:${now.day}:${now.hour}`, category: "store_inventory_digest", to: email, ...template, tags: {store_id: storeId}});
  }));
});

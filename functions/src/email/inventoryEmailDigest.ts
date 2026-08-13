import * as admin from "firebase-admin";
import {getFirestore} from "firebase-admin/firestore";
import {defineString} from "firebase-functions/params";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {enqueueEmail} from "./emailQueueService";
import {inventoryDigestEmail} from "./emailTemplates";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");
const appUrl = defineString("APP_URL", {default: "https://liamarketplace.com"});
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";

export const sendStoreInventoryEmailDigest = onSchedule({schedule: "every day 09:00", region: "us-central1", timeZone: "America/Chicago"}, async () => {
  const products = await db.collection("products").where("isLowStock", "==", true).where("isArchived", "==", false).select("storeId", "name").get();
  const byStore = new Map<string, string[]>();
  for (const product of products.docs) {
    const storeId = text(product.data().storeId);
    if (!storeId) continue;
    const names = byStore.get(storeId) ?? [];
    names.push(text(product.data().name) || "Unnamed product");
    byStore.set(storeId, names);
  }
  const day = new Date().toISOString().slice(0, 10);
  await Promise.all([...byStore].map(async ([storeId, names]) => {
    const store = await db.collection("stores").doc(storeId).get();
    const data = store.data() ?? {};
    if (!store.exists || data.isApproved !== true || data.productStockNotifications === false || data.emailNotifications === false) return;
    const owner = await db.collection("users").doc(text(data.ownerId)).get();
    const email = text(owner.data()?.email) || text(data.email);
    names.sort((a, b) => a.localeCompare(b));
    const template = inventoryDigestEmail({storeName: text(data.name) || "Your store", productNames: names, url: `${appUrl.value().replace(/\/+$/, "")}/store/products?status=low_stock`});
    await enqueueEmail({dedupeKey: `store-inventory-digest:${storeId}:${day}`, category: "store_inventory_digest", to: email, ...template, tags: {store_id: storeId}});
  }));
});


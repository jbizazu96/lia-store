import * as admin from "firebase-admin";
import {FieldValue, getFirestore} from "firebase-admin/firestore";
import {onDocumentWritten} from "firebase-functions/v2/firestore";

if (admin.apps.length === 0) admin.initializeApp();
const db = getFirestore("default");

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }

async function refreshCategory(storeId: string, categoryId: string): Promise<void> {
  if (!storeId || !categoryId) return;
  const reference = db.collection("stores").doc(storeId).collection("productCategorySummaries").doc(categoryId);
  const products = db.collection("products").where("storeId", "==", storeId).where("isArchived", "==", false).where("category", "==", categoryId);
  const [count, preview, category] = await Promise.all([
    products.count().get(),
    products.orderBy("nameSearch").limit(10).get(),
    db.collection("categories").doc(categoryId).get(),
  ]);
  if (count.data().count === 0) { await reference.delete().catch(() => undefined); return; }
  await reference.set({
    categoryId,
    name: text(category.data()?.name) || categoryId,
    count: count.data().count,
    products: preview.docs.map((item) => ({id: item.id, ...item.data()})),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export const storeProductCategorySummarySync = onDocumentWritten(
  {document: "products/{productId}", database: "default", region: "us-central1"},
  async (event) => {
    const before = event.data?.before.data() ?? {};
    const after = event.data?.after.data() ?? {};
    const pairs = new Map<string, {storeId: string; categoryId: string}>();
    [before, after].forEach((data) => {
      const storeId = text(data.storeId); const categoryId = text(data.category);
      if (storeId && categoryId) pairs.set(`${storeId}:${categoryId}`, {storeId, categoryId});
    });
    await Promise.all([...pairs.values()].map(({storeId, categoryId}) => refreshCategory(storeId, categoryId)));
  },
);

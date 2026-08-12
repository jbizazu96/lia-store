import {createHash} from "crypto";
import {getFirestore} from "firebase-admin/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {notificationStore} from "../services/notificationStore";
import {notificationService} from "../services/notificationService";

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

interface OutOfStockProduct {
  id: string;
  name: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function reminderKey(storeId: string, windowNumber: number): string {
  const digest = createHash("sha256")
    .update(`${storeId}:${windowNumber}`)
    .digest("hex")
    .slice(0, 32);
  return `out-of-stock-${digest}`;
}

function reminderBody(products: OutOfStockProduct[]): string {
  const names = products.slice(0, 3).map((product) => product.name);
  const remaining = products.length - names.length;
  const productLabel = products.length === 1 ? "product is" : "products are";
  const nameList = names.join(", ");
  return `${products.length} ${productLabel} out of stock: ${nameList}${remaining > 0 ? ` and ${remaining} more` : ""}. Update your inventory when stock is available.`;
}

export const remindOutOfStockProducts = onSchedule(
  {
    schedule: "every 3 hours",
    region: "us-central1",
    timeZone: "America/Chicago",
    retryCount: 3,
  },
  async () => {
    const db = getFirestore("default");
    const snapshot = await db.collection("products")
      .where("stock", "==", 0)
      .select("storeId", "name")
      .get();

    if (snapshot.empty) {
      console.log("No out-of-stock products need store reminders.");
      return;
    }

    const productsByStore = new Map<string, OutOfStockProduct[]>();
    snapshot.docs.forEach((document) => {
      const storeId = text(document.data().storeId);
      if (!storeId) return;
      const products = productsByStore.get(storeId) ?? [];
      products.push({id: document.id, name: text(document.data().name) || "Unnamed product"});
      productsByStore.set(storeId, products);
    });

    const storeIds = [...productsByStore.keys()];
    const storeDocuments = [];
    for (let start = 0; start < storeIds.length; start += 100) {
      const references = storeIds.slice(start, start + 100)
        .map((storeId) => db.collection("stores").doc(storeId));
      storeDocuments.push(...await db.getAll(...references));
    }

    const windowNumber = Math.floor(Date.now() / THREE_HOURS_MS);
    let sent = 0;
    let skipped = 0;

    await Promise.all(storeDocuments.map(async (storeDocument) => {
      const store = storeDocument.data();
      const ownerId = text(store?.ownerId);
      const products = productsByStore.get(storeDocument.id) ?? [];
      if (!storeDocument.exists || !ownerId || store?.isApproved !== true || store?.isActive !== true || products.length === 0) {
        skipped += 1;
        return;
      }

      products.sort((first, second) => first.name.localeCompare(second.name));
      const title = products.length === 1 ? "Product out of stock" : "Products out of stock";
      const body = reminderBody(products);
      const created = await notificationStore.createNotification({
        uid: ownerId,
        title,
        body,
        type: "inventory",
        icon: "package",
        color: "red",
        navigationPath: "/store/products",
        dedupeKey: reminderKey(storeDocument.id, windowNumber),
      });

      if (!created) {
        skipped += 1;
        return;
      }

      sent += 1;
      await notificationService.sendToUser(
        ownerId,
        title,
        body,
        "/store/products",
        "productStock",
      );
    }));

    console.log(`Out-of-stock reminder run completed: ${sent} sent, ${skipped} skipped.`);
  },
);

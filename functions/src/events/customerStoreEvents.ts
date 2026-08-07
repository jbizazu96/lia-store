/*
|--------------------------------------------------------------------------
| Customer Store Events
|--------------------------------------------------------------------------
|
| Store marketing notices go only to customers who have already ordered from
| that store. This avoids sending unrelated store activity to every customer
| in the marketplace.
|
*/

import { getFirestore } from "firebase-admin/firestore";

import { notificationService } from "../services/notificationService";
import { notificationStore } from "../services/notificationStore";
import type { NotificationPreference } from "../services/notificationService";

interface StoreCustomerNotification {
  storeId: string;
  title: string;
  body: string;
  icon: string;
  color: string;
  deepLink: string;
  preference: NotificationPreference;
}

async function getStoreCustomerUids(
  storeId: string
): Promise<string[]> {
  const snapshot = await getFirestore("default")
    .collection("orders")
    .where("store.id", "==", storeId)
    .get();

  return Array.from(
    new Set(
      snapshot.docs
        .map((order) => order.data().customer?.uid)
        .filter(
          (uid): uid is string =>
            typeof uid === "string" && uid.trim().length > 0
        )
    )
  );
}

export class CustomerStoreEvents {
  private async notifyAllCustomers(
    input: Omit<StoreCustomerNotification, "storeId">
  ): Promise<void> {
    const customers = await getFirestore("default")
      .collection("users")
      .where("accountType", "==", "customer")
      .get();

    await Promise.allSettled(
      customers.docs.map(async (customer) => {
        await notificationStore.createNotification({
          uid: customer.id,
          title: input.title,
          body: input.body,
          type: "promotion",
          icon: input.icon,
          color: input.color,
          navigationPath: input.deepLink,
        });
        await notificationService.sendToUser(
          customer.id,
          input.title,
          input.body,
          input.deepLink,
          input.preference,
        );
      }),
    );
  }
  private async notifyPreviousCustomers(
    input: StoreCustomerNotification
  ): Promise<void> {
    const customerUids = await getStoreCustomerUids(input.storeId);

    if (customerUids.length === 0) {
      console.log(
        `No previous customers to notify for store ${input.storeId}.`
      );
      return;
    }

    await Promise.allSettled(
      customerUids.map(async (uid) => {
        await notificationStore.createNotification({
          uid,
          title: input.title,
          body: input.body,
          type: "promotion",
          icon: input.icon,
          color: input.color,
          navigationPath: input.deepLink,
        });

        await notificationService.sendToUser(
          uid,
          input.title,
          input.body,
          input.deepLink,
          input.preference,
        );
      })
    );
  }

  async newProduct(
    storeId: string,
    productId: string,
    productName: string,
    storeName: string
  ): Promise<void> {
    await this.notifyPreviousCustomers({
      storeId,
      title: "New product available",
      body: `${productName} is now available at ${storeName}.`,
      icon: "package",
      color: "green",
      deepLink: `/product/${productId}`,
      preference: "productUpdates",
    });
  }

  async newPromotion(
    productId: string,
    productName: string,
    storeName: string,
    promotionLabel: string
  ): Promise<void> {
    await this.notifyAllCustomers({
      title: "New store promotion",
      body: `${promotionLabel} on ${productName} at ${storeName}.`,
      icon: "tag",
      color: "orange",
      deepLink: `/product/${productId}`,
      preference: "promotions",
    });
  }

  async newPlatformPromotion(
    title: string,
    body: string,
    deepLink: string,
  ): Promise<void> {
    await this.notifyAllCustomers({
      title,
      body,
      icon: "tag",
      color: "orange",
      deepLink,
      preference: "marketing",
    });
  }
}

export const customerStoreEvents = new CustomerStoreEvents();

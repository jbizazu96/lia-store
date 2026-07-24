/*
|--------------------------------------------------------------------------
| Notification Service
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| This service is the only place responsible for interacting
| with user notifications in Firestore.
|
| React pages should NEVER query Firestore directly.
|
*/

import {
  collection,
  deleteDoc,
  doc,
  addDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import type {
  Notification,
  NotificationType,
} from "./notificationTypes";

import {
  mapFirestoreNotification,
} from "./notificationMapper";

export class NotificationService {

  /**
   * Creates a notification.
   */
  async createNotification(
    uid: string,
    title: string,
    body: string,
    type: NotificationType,
    orderId?: string
  ): Promise<void> {

    await addDoc(

      collection(
        db,
        "users",
        uid,
        "notifications"
      ),

      {

        uid,

        title,

        body,

        type,

        orderId,

        read: false,

        createdAt: serverTimestamp(),
      }

    );

  }

  /**
   * Returns every notification for a user.
   */
  async getNotifications(
    uid: string
  ): Promise<Notification[]> {

    const q = query(

      collection(
        db,
        "users",
        uid,
        "notifications"
      ),

      orderBy(
        "createdAt",
        "desc"
      )

    );

    const snapshot =
      await getDocs(q);

    return snapshot.docs.map(
      mapFirestoreNotification
    );

  }

  /**
   * Returns unread notification count.
   */
  async getUnreadCount(
    uid: string
  ): Promise<number> {

    const q = query(

      collection(
        db,
        "users",
        uid,
        "notifications"
      ),

      where(
        "read",
        "==",
        false
      )

    );

    const snapshot =
      await getDocs(q);

    return snapshot.size;

  }

  /**
   * Marks one notification as read.
   */
  async markAsRead(
    uid: string,
    notificationId: string
  ): Promise<void> {

    await updateDoc(

      doc(
        db,
        "users",
        uid,
        "notifications",
        notificationId
      ),

      {

        read: true,

      }

    );

  }

  /** Deletes one notification owned by the current user. */
  async deleteNotification(
    uid: string,
    notificationId: string
  ): Promise<void> {
    await deleteDoc(
      doc(
        db,
        "users",
        uid,
        "notifications",
        notificationId
      )
    );
  }

  /** Removes every notification for one user in Firestore-safe batches. */
  async clearAllNotifications(
    uid: string
  ): Promise<void> {
    const notificationsReference = collection(
      db,
      "users",
      uid,
      "notifications"
    );

    const snapshot = await getDocs(notificationsReference);
    const notificationDocuments = snapshot.docs;

    for (let start = 0; start < notificationDocuments.length; start += 450) {
      const batch = writeBatch(db);

      notificationDocuments
        .slice(start, start + 450)
        .forEach((notificationDocument) => {
          batch.delete(notificationDocument.ref);
        });

      await batch.commit();
    }
  }

  /**
 * Listen for unread notification count changes.
 */
listenForUnreadCount(
  uid: string,
  callback: (count: number) => void
) {

  const q = query(

    collection(
      db,
      "users",
      uid,
      "notifications"
    ),

    where(
      "read",
      "==",
      false
    )

  );

  return onSnapshot(

    q,

    (snapshot) => {

      callback(
        snapshot.size
      );

    }

  );

}

/**
 * Listen for notification changes.
 */
listenForNotifications(
  uid: string,
  callback: (notifications: Notification[]) => void,
  onError?: (error: Error) => void
) {

  const q = query(

    collection(
      db,
      "users",
      uid,
      "notifications"
    ),

    orderBy(
      "createdAt",
      "desc"
    )

  );

  return onSnapshot(

    q,

    (snapshot) => {

      callback(

        snapshot.docs.map(
          mapFirestoreNotification
        )

      );

    },

    (error) => {
      console.error("Unable to listen for notifications:", error);
      onError?.(error);
    }

  );

}

}

export const notificationService =
  new NotificationService();

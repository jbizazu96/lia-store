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
  doc,
  addDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
  onSnapshot,
   serverTimestamp,
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

}

export const notificationService =
  new NotificationService();
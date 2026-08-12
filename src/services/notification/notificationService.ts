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
  getDocs,
  getCountFromServer,
  documentId,
  limit,
  orderBy,
  query,
  startAfter,
  updateDoc,
  where,
  onSnapshot,
  writeBatch,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

import type {
  Notification,
} from "./notificationTypes";

import {
  mapFirestoreNotification,
} from "./notificationMapper";
import {publishNotificationMutation} from "./notificationSync";

export class NotificationService {

  /* Do not let a caller target another user's notification path. */
  private requireCurrentUser(uid: string): string {
    if (!uid.trim() || auth.currentUser?.uid !== uid) {
      throw new Error("You are not authorized to manage these notifications.");
    }

    return uid;
  }

  /** Returns one bounded page. The timestamp/id pair is a stable cursor. */
  async getNotifications(
    uid: string,
    options: {
      pageSize?: number;
      cursor?: {createdAt: Date; id: string} | null;
    } = {},
  ): Promise<{
    notifications: Notification[];
    hasMore: boolean;
    nextCursor: {createdAt: Date; id: string} | null;
  }> {

    const currentUid = this.requireCurrentUser(uid);
    const requestedSize = Math.min(50, Math.max(1, options.pageSize ?? 25));
    const constraints = [
      orderBy("createdAt", "desc"),
      orderBy(documentId(), "desc"),
      ...(options.cursor
        ? [startAfter(options.cursor.createdAt, options.cursor.id)]
        : []),
      limit(requestedSize + 1),
    ];
    const q = query(

      collection(
        db,
        "users",
        currentUid,
        "notifications"
      ),

      ...constraints
    );

    const snapshot =
      await getDocs(q);

    const pageDocuments = snapshot.docs.slice(0, requestedSize);
    const notifications = pageDocuments.map(mapFirestoreNotification);
    const lastNotification = notifications.at(-1);
    return {
      notifications,
      hasMore: snapshot.docs.length > requestedSize,
      nextCursor: lastNotification
        ? {createdAt: lastNotification.createdAt, id: lastNotification.id}
        : null,
    };

  }

  /**
   * Returns unread notification count.
   */
  async getUnreadCount(
    uid: string
  ): Promise<number> {

    const currentUid = this.requireCurrentUser(uid);
    const q = query(

      collection(
        db,
        "users",
        currentUid,
        "notifications"
      ),

      where(
        "read",
        "==",
        false
      )

    );

    const snapshot = await getCountFromServer(q);
    return snapshot.data().count;

  }

  /**
   * Marks one notification as read.
   */
  async markAsRead(
    uid: string,
    notificationId: string
  ): Promise<void> {

    const currentUid = this.requireCurrentUser(uid);
    await updateDoc(

      doc(
        db,
        "users",
        currentUid,
        "notifications",
        notificationId
      ),

      {

        read: true,

      }

    );

    publishNotificationMutation({
      workspace: "user",
      action: "read-one",
      notificationId,
    });

  }

  /** Marks every unread notification for one user as read in safe batches. */
  async markAllAsRead(
    uid: string
  ): Promise<void> {
    const currentUid = this.requireCurrentUser(uid);
    const unreadQuery = query(
      collection(db, "users", currentUid, "notifications"),
      where("read", "==", false)
    );

    const snapshot = await getDocs(unreadQuery);

    for (let start = 0; start < snapshot.docs.length; start += 450) {
      const batch = writeBatch(db);

      snapshot.docs
        .slice(start, start + 450)
        .forEach((notificationDocument) => {
          batch.update(notificationDocument.ref, { read: true });
        });

      await batch.commit();
    }

    publishNotificationMutation({workspace: "user", action: "read-all"});
  }

  /** Deletes one notification owned by the current user. */
  async deleteNotification(
    uid: string,
    notificationId: string
  ): Promise<void> {
    const currentUid = this.requireCurrentUser(uid);
    await deleteDoc(
      doc(
        db,
        "users",
        currentUid,
        "notifications",
        notificationId
      )
    );

    publishNotificationMutation({
      workspace: "user",
      action: "read-one",
      notificationId,
    });
  }

  /** Removes every notification for one user in Firestore-safe batches. */
  async clearAllNotifications(
    uid: string
  ): Promise<void> {
    const currentUid = this.requireCurrentUser(uid);
    const notificationsReference = collection(
      db,
      "users",
      currentUid,
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

    publishNotificationMutation({workspace: "user", action: "clear-all"});
  }

  /**
 * Listen for unread notification count changes.
 */
listenForUnreadCount(
  uid: string,
  callback: (count: number) => void
) {

  const currentUid = this.requireCurrentUser(uid);
  const q = query(

    collection(
      db,
      "users",
      currentUid,
      "notifications"
    ),

    where(
      "read",
      "==",
      false
    ),
    limit(1)

  );

  return onSnapshot(

    q,

    () => {
      void this.getUnreadCount(currentUid).then(callback).catch((error) => {
        console.error("Unable to count unread notifications:", error);
      });
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

  const currentUid = this.requireCurrentUser(uid);
  const q = query(

    collection(
      db,
      "users",
      currentUid,
      "notifications"
    ),

    orderBy(
      "createdAt",
      "desc"
    ),
    limit(50)

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

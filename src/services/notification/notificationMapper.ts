/*
|--------------------------------------------------------------------------
| Notification Mapper
|--------------------------------------------------------------------------
|
| PURPOSE
| -------
| Converts Firestore notification documents into the
| Notification domain model.
|
| React pages should never work directly with Firestore.
|
*/

import type { DocumentSnapshot } from "firebase/firestore";
import type { Notification } from "./notificationTypes";

/**
 * Converts a Firestore document into our Notification model.
 */
export function mapFirestoreNotification(
  document: DocumentSnapshot
): Notification {

  const data = document.data();

  if (!data) {
    throw new Error(
      "Notification document does not exist."
    );
  }

  return {

    id: document.id,

    uid: data.uid,

    title: data.title,

    body: data.body,

    type: data.type,

    orderId: data.orderId,

    read: data.read ?? false,

    createdAt:
      data.createdAt?.toDate?.() ??
      new Date(),

  };

}
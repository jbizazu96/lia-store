/*
|--------------------------------------------------------------------------
| Admin Notification Client Service
|--------------------------------------------------------------------------
|
| Notification data is private. The browser reaches it only through callable
| Functions, which verify admins/{uid} for every request.
|
*/

import {
  httpsCallable,
} from "firebase/functions";
import {
  functions,
} from "@/lib/firebase";
import type {
  AdminNotification,
} from "@/types/adminNotification";

async function call<T>(name: string, data?: unknown): Promise<T> {
  const result = await httpsCallable<unknown, T>(functions, name)(data);
  return result.data;
}

export const adminNotificationClientService = {
  getNotifications: () => call<{notifications: AdminNotification[]}>(
    "getAdminNotifications"
  ),

  markRead: (notificationId: string) => call<{success: boolean}>(
    "markAdminNotificationRead",
    {notificationId}
  ),

  clear: () => call<{
    success: boolean;
    cleared: number;
    hasMore: boolean;
  }>("clearAdminNotifications"),
};

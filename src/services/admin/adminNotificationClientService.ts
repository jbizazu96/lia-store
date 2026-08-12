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
import {publishNotificationMutation} from "@/services/notification/notificationSync";

async function call<T>(name: string, data?: unknown): Promise<T> {
  const result = await httpsCallable<unknown, T>(functions, name)(data);
  return result.data;
}

export const adminNotificationClientService = {
  getNotifications: () => call<{notifications: AdminNotification[]}>(
    "getAdminNotifications"
  ),

  markRead: async (notificationId: string) => {
    const result = await call<{success: boolean}>("markAdminNotificationRead", {notificationId});
    publishNotificationMutation({workspace: "admin", action: "read-one", notificationId});
    return result;
  },

  markAllRead: async () => {
    const result = await call<{success: boolean; marked: number}>("markAllAdminNotificationsRead");
    publishNotificationMutation({workspace: "admin", action: "read-all"});
    return result;
  },

  clear: async () => {
    const result = await call<{
    success: boolean;
    cleared: number;
    hasMore: boolean;
    }>("clearAdminNotifications");
    publishNotificationMutation({workspace: "admin", action: "clear-all"});
    return result;
  },
};

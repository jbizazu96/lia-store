"use client";

/*
|--------------------------------------------------------------------------
| Notification Context
|--------------------------------------------------------------------------
|
| Provides unread notification count
| to the entire application.
|
*/

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import {usePathname} from "next/navigation";

import { useAuth } from "./AuthContext";

import { notificationService } from "@/services/notification/notificationService";
import {listenForNotificationMutations} from "@/services/notification/notificationSync";
import {auth} from "@/lib/firebase";
import {Capacitor} from "@capacitor/core";
import {Badge} from "@capawesome/capacitor-badge";

interface NotificationContextType {

  unreadCount: number;

}

const NotificationContext =
  createContext<NotificationContextType>({
    unreadCount: 0,
  });

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {

  const { user } = useAuth();
  const pathname = usePathname();

  const [unreadCount, setUnreadCount] =
    useState(0);

  useEffect(() => {

    /* Native also keeps the application icon badge authoritative off Home. */
    if (!user || (pathname !== "/home" && !Capacitor.isNativePlatform())) {
      return;

    }

    /*
     * AuthContext and Firebase Auth can be one render apart during sign-in,
     * sign-out, and account switching. Treat that short mismatch as a normal
     * transition instead of allowing the ownership guard to throw globally.
     */
    try {
      const unsubscribe = notificationService.listenForUnreadCount(
        user.uid,
        setUnreadCount,
        (error) => {
          console.error("Unable to listen for unread notifications:", error);
        },
      );

      return unsubscribe;
    } catch (error) {
      if (auth.currentUser?.uid !== user.uid) return;
      console.error("Unable to start the unread notification listener:", error);
    }

  }, [pathname, user]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const count = user ? Math.max(0, unreadCount) : 0;
    void Badge.isSupported().then(({isSupported}) => {
      if (!isSupported) return;
      return count > 0 ? Badge.set({count}) : Badge.clear();
    }).catch(() => undefined);
  }, [unreadCount, user]);

  useEffect(() => listenForNotificationMutations("user", (mutation) => {
    if (mutation.action === "read-one") {
      setUnreadCount((count) => Math.max(0, count - 1));
    } else {
      setUnreadCount(0);
    }
  }), []);

  return (

    <NotificationContext.Provider
      value={{
        unreadCount: user && pathname === "/home" ? unreadCount : 0,
      }}
    >

      {children}

    </NotificationContext.Provider>

  );

}

export function useNotifications() {

  return useContext(
    NotificationContext
  );

}

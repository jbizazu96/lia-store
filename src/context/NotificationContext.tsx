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

import { useAuth } from "./AuthContext";

import { notificationService } from "@/services/notification/notificationService";
import {listenForNotificationMutations} from "@/services/notification/notificationSync";

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

  const [unreadCount, setUnreadCount] =
    useState(0);

  useEffect(() => {

    if (!user) {
      return;

    }

    const unsubscribe =
      notificationService.listenForUnreadCount(

        user.uid,

        setUnreadCount

      );

    return unsubscribe;

  }, [user]);

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
        unreadCount: user ? unreadCount : 0,
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

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

      setUnreadCount(0);

      return;

    }

    const unsubscribe =
      notificationService.listenForUnreadCount(

        user.uid,

        setUnreadCount

      );

    return unsubscribe;

  }, [user]);

  return (

    <NotificationContext.Provider
      value={{
        unreadCount,
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
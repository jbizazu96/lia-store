"use client";

/*
|--------------------------------------------------------------------------
| Notifications Page
|--------------------------------------------------------------------------
|
| Displays all notifications for the current user.
| ✅ Branded loading screen with logo and orbit animation
| ✅ Back button to navigate home
| ✅ Beautiful modern design
|
*/

import { useEffect, useState } from "react";
import { ArrowLeft, Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

import { useAuth } from "@/context/AuthContext";
import { BrandedLoader } from "@/components/ui/BrandedLoader";

import {
  notificationService,
} from "@/services/notification/notificationService";

import type {
  Notification,
} from "@/services/notification/notificationTypes";

import {
  NotificationCard,
} from "@/components/notifications/NotificationCard";

export default function NotificationsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [listenerError, setListenerError] = useState<string | null>(null);


  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setListenerError(null);

    const unsubscribe = notificationService.listenForNotifications(
      user.uid,
      (notifications) => {
        setNotifications(notifications);
        setLoading(false);
      },
      (error) => {
        console.error("Failed to load customer notifications:", error);
        setListenerError("We couldn't load your notifications. Please try again.");
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  if (loading) {
    return <BrandedLoader message="Loading notifications" />;
  }

  if (listenerError) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-white rounded-2xl border border-gray-100 p-6 text-center shadow-sm">
          <Bell className="w-12 h-12 text-orange-400 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-gray-800">Notifications unavailable</h1>
          <p className="text-sm text-gray-500 mt-2">{listenerError}</p>
          <button
            onClick={() => router.refresh()}
            className="mt-5 px-5 py-2.5 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  // ✅ Separate read and unread notifications
  const unreadNotifications = notifications.filter(n => !n.read);
  const readNotifications = notifications.filter(n => n.read);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header with Back Button */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="flex items-center gap-3 px-4 py-4 max-w-2xl mx-auto">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-100 rounded-full transition"
            aria-label="Go back home"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-xl font-bold text-gray-800">Notifications</h1>
          <span className="text-xs text-gray-400 ml-auto">
            {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {notifications.length === 0 ? (
          // ✅ Empty State
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm"
          >
            <div className="relative w-24 h-24 mx-auto mb-4">
              <div className="absolute inset-0 bg-orange-100 rounded-full opacity-20 scale-150" />
              <div className="relative w-full h-full flex items-center justify-center">
                <Bell className="w-12 h-12 text-orange-300" />
                <motion.div
                  animate={{
                    y: [0, -8, 0],
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 2,
                    ease: "easeInOut",
                  }}
                  className="absolute -top-1 -right-1 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center"
                >
                  <span className="text-xs">🔔</span>
                </motion.div>
              </div>
            </div>
            <p className="text-gray-500 text-lg font-medium">No notifications yet</p>
            <p className="text-gray-400 text-sm mt-1">
              We'll notify you when something happens with your orders
            </p>
            <button
              onClick={() => router.push("/home")}
              className="mt-4 px-6 py-2 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition"
            >
              Browse Stores
            </button>
          </motion.div>
        ) : (
          // ✅ Notifications List
          <AnimatePresence mode="popLayout">
            <div className="space-y-3">
              {/* Unread Section */}
              {unreadNotifications.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    New
                  </p>
                </div>
              )}
              
              {unreadNotifications.map((notification) => (
                <motion.div
                  key={notification.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <NotificationCard
                    notification={notification}
                    onClick={async () => {
                      if (!user) return;
                      await notificationService.markAsRead(
                        user.uid,
                        notification.id
                      );
                      if (notification.deepLink) {
                        router.push(notification.deepLink);
                      }
                    }}
                  />
                </motion.div>
              ))}

              {/* Read Section */}
              {readNotifications.length > 0 && (
                <div className="mt-4 mb-2">
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Earlier
                  </p>
                </div>
              )}
              
              {readNotifications.map((notification) => (
                <motion.div
                  key={notification.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <NotificationCard
                    notification={notification}
                    onClick={async () => {
                      if (!user) return;
                      await notificationService.markAsRead(
                        user.uid,
                        notification.id
                      );
                      if (notification.deepLink) {
                        router.push(notification.deepLink);
                      }
                    }}
                  />
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>
    </main>
  );
}

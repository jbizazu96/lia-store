"use client";

/*
|--------------------------------------------------------------------------
| Store Notifications Page
|--------------------------------------------------------------------------
|
| Displays all notifications for the store owner.
| ✅ Branded loading screen with logo and orbit animation
| ✅ Back button to navigate to dashboard
| ✅ Store-specific design matching store layout
|
*/

import { useEffect, useState } from "react";
import { ArrowLeft, Bell, Store, Package, ShoppingBag, Clock } from "lucide-react";
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
import { useConfirmation } from "@/context/ConfirmationContext";
import { useSuccessToast } from "@/context/SuccessToastContext";

export default function StoreNotificationsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const { confirm } = useConfirmation();
  const { showSuccess } = useSuccessToast();

  const deleteNotification = async (notification: Notification) => {
    if (!user) return;

    const confirmed = await confirm({
      title: "Delete notification?",
      message: "This notification will be permanently removed.",
      confirmLabel: "Delete",
      cancelLabel: "Keep notification",
      destructive: true,
    });

    if (!confirmed) return;

    await notificationService.deleteNotification(user.uid, notification.id);
    showSuccess("Notification deleted.");
  };

  const clearAllNotifications = async () => {
    if (!user || notifications.length === 0) return;

    const confirmed = await confirm({
      title: "Clear all notifications?",
      message: "All store notifications will be permanently removed.",
      confirmLabel: "Clear all",
      cancelLabel: "Keep notifications",
      destructive: true,
    });

    if (!confirmed) return;

    try {
      setClearing(true);
      await notificationService.clearAllNotifications(user.uid);
      showSuccess("All notifications cleared.");
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    const unsubscribe = notificationService.listenForNotifications(
      user.uid,
      (notifications) => {
        setNotifications(notifications);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [user]);

  if (loading) {
    return <BrandedLoader message="Loading Notifications" />;
  }

  // ✅ Separate read and unread notifications
  const unreadNotifications = notifications.filter(n => !n.read);
  const readNotifications = notifications.filter(n => n.read);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Store Header with Back Button */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="flex items-center gap-3 px-6 py-4">
          <button
            onClick={() => router.push("/store/dashboard")}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
            aria-label="Go back to dashboard"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-orange-500" />
            <h1 className="text-xl font-bold text-gray-800">Notifications</h1>
          </div>
          <span className="text-xs text-gray-400 ml-auto bg-gray-100 px-3 py-1 rounded-full">
            {notifications.length} total
          </span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {/* Store Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-50 rounded-lg">
                <Bell className="w-4 h-4 text-orange-500" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Total</p>
                <p className="text-lg font-bold text-gray-800">{notifications.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Clock className="w-4 h-4 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Unread</p>
                <p className="text-lg font-bold text-blue-600">{unreadNotifications.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-50 rounded-lg">
                <Package className="w-4 h-4 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-gray-400">Read</p>
                <p className="text-lg font-bold text-green-600">{readNotifications.length}</p>
              </div>
            </div>
          </div>
        </div>

        {notifications.length === 0 ? (
          // ✅ Store Empty State
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-gray-200 p-16 text-center shadow-sm"
          >
            <div className="relative w-32 h-32 mx-auto mb-6">
              <div className="absolute inset-0 bg-orange-100 rounded-full opacity-20 scale-150" />
              <div className="relative w-full h-full flex items-center justify-center">
                <div className="w-20 h-20 bg-gradient-to-br from-orange-400 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg">
                  <Bell className="w-10 h-10 text-white" />
                </div>
                <motion.div
                  animate={{
                    y: [0, -10, 0],
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 2,
                    ease: "easeInOut",
                  }}
                  className="absolute -top-2 -right-2 w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center border-2 border-white"
                >
                  <span className="text-xs">🔔</span>
                </motion.div>
              </div>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">No notifications yet</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">
              You'll receive notifications here when customers place new orders or when there are important store updates.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => router.push("/store/dashboard")}
                className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-medium hover:shadow-lg hover:from-orange-600 hover:to-orange-700 transition"
              >
                Back to Dashboard
              </button>
              <button
                onClick={() => router.push("/store/store-orders")}
                className="px-6 py-2.5 border border-gray-200 text-gray-600 rounded-xl font-medium hover:bg-gray-50 transition"
              >
                View Orders
              </button>
            </div>
          </motion.div>
        ) : (
          // ✅ Notifications List
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">All Notifications</h2>
                <div className="flex items-center gap-3">
                  {unreadNotifications.length > 0 && (
                    <button
                      onClick={async () => {
                        if (!user) return;
                        for (const notification of unreadNotifications) {
                          await notificationService.markAsRead(user.uid, notification.id);
                        }
                        showSuccess("All notifications marked as read.");
                      }}
                      className="text-xs text-orange-600 font-medium hover:text-orange-700 transition"
                    >
                      Mark all as read
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={clearAllNotifications}
                    disabled={clearing}
                    className="text-xs font-semibold text-red-600 transition hover:text-red-700 disabled:opacity-50"
                  >
                    {clearing ? "Clearing..." : "Clear all"}
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-4">
              <AnimatePresence mode="popLayout">
                <div className="space-y-3">
                  {/* Unread Section */}
                  {unreadNotifications.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-orange-600 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                        New ({unreadNotifications.length})
                      </p>
                    </div>
                  )}
                  
                  {unreadNotifications.map((notification) => (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="bg-orange-50/30 rounded-xl border border-orange-100 hover:border-orange-200 transition"
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
                    <div className="mt-4 mb-3">
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                        Earlier ({readNotifications.length})
                      </p>
                    </div>
                  )}
                  
                  {readNotifications.map((notification) => (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="rounded-xl border border-gray-100 hover:border-gray-200 transition"
                    >
                      <NotificationCard
                        notification={notification}
                        onDelete={() => deleteNotification(notification)}
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
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

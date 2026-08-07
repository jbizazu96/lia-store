"use client";

/*
  Notification preferences section.
*/

import {useEffect, useState} from "react";
import {Bell, CreditCard, Mail, Package, ShoppingBag, Smartphone} from "lucide-react";
import {
  firebaseMessaging,
  type NotificationPermissionState,
} from "@/services/notification/firebaseMessaging";

interface NotificationsSectionProps {
  storeData: any;
  setStoreData: (data: any) => void;
}

export function NotificationsSection({storeData, setStoreData}: NotificationsSectionProps) {
  const [permission, setPermission] =
    useState<NotificationPermissionState>("prompt");
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    void firebaseMessaging.getPermissionStatus()
      .then(setPermission)
      .catch(() => setPermission("unsupported"));
  }, []);

  const toggleSetting = (key: string) => {
    setStoreData({
      ...storeData,
      [key]: !storeData?.[key],
    });
  };

  const notifications = [
    {
      id: "orderNotifications",
      label: "Order Notifications",
      description: "Get notified when new orders come in",
      icon: ShoppingBag,
    },
    {
      id: "paymentNotifications",
      label: "Payment Notifications",
      description: "Payout, transfer, and payment-status updates",
      icon: CreditCard,
    },
    {
      id: "productStockNotifications",
      label: "Product Stock Notifications",
      description: "Low-stock and out-of-stock product alerts",
      icon: Package,
    },
    {
      id: "emailNotifications",
      label: "Email Notifications",
      description: "Saved now; automatic email delivery is coming soon",
      icon: Mail,
    },
    {
      id: "pushNotifications",
      label: "Push Notifications",
      description: "Get real-time alerts on your device",
      icon: Smartphone,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-4">
          <Bell className="w-5 h-5 text-gray-400" />
          <h3 className="font-bold text-gray-800">Notification Preferences</h3>
        </div>

        <div className="mb-4 rounded-xl bg-orange-50 p-3 text-sm text-orange-900">
          <p className="font-semibold">Device push notifications</p>
          <p className="mt-1 text-xs leading-5 text-orange-800">
            {permission === "granted"
              ? "Push notifications are enabled on this device."
              : permission === "denied"
                ? "Notifications are blocked in this device's settings."
                : permission === "unsupported"
                  ? "Push notifications are not available on this device."
                  : "Enable push notifications to receive alerts outside the LIA app."}
          </p>
          {permission === "prompt" && (
            <button
              type="button"
              disabled={enabling}
              onClick={async () => {
                setEnabling(true);
                try {
                  await firebaseMessaging.registerDevice({requestPermission: true});
                  setPermission(await firebaseMessaging.getPermissionStatus());
                } finally {
                  setEnabling(false);
                }
              }}
              className="mt-3 rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              {enabling ? "Enabling…" : "Enable on this device"}
            </button>
          )}
        </div>

        <div className="space-y-3">
          {notifications.map((item) => {
            const Icon = item.icon;
            const isEnabled = storeData?.[item.id] !== false;
            
            return (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center">
                    <Icon className="w-4 h-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{item.label}</p>
                    <p className="text-xs text-gray-500">{item.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => toggleSetting(item.id)}
                  className={`relative w-12 h-6 rounded-full transition ${
                    isEnabled ? "bg-orange-500" : "bg-gray-300"
                  }`}
                  aria-label={`Toggle ${item.label}`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition ${
                      isEnabled ? "right-0.5" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

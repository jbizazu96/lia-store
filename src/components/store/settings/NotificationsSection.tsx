"use client";

/*
  Notification preferences section.
*/

import {useEffect, useState, type Dispatch, type SetStateAction} from "react";
import {Bell, CreditCard, Package, ShoppingBag, Smartphone} from "lucide-react";
import {
  firebaseMessaging,
  type NotificationDeviceStatus,
  type NotificationPermissionState,
} from "@/services/notification/firebaseMessaging";
import type {StoreWorkspaceStore} from "@/services/store/storeWorkspaceClientService";

interface NotificationsSectionProps {
  storeData: StoreWorkspaceStore;
  setStoreData: Dispatch<SetStateAction<StoreWorkspaceStore | null>>;
}

type NotificationSetting = "orderNotifications" | "paymentNotifications" | "productStockNotifications" | "pushNotifications";

export function NotificationsSection({storeData, setStoreData}: NotificationsSectionProps) {
  const [permission, setPermission] =
    useState<NotificationPermissionState>("prompt");
  const [enabling, setEnabling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<NotificationDeviceStatus | null>(null);
  const [deviceMessage, setDeviceMessage] = useState("");

  const refreshDeviceStatus = async () => {
    const [nextPermission, nextStatus] = await Promise.all([
      firebaseMessaging.getPermissionStatus(),
      firebaseMessaging.getDeviceStatus(),
    ]);
    setPermission(nextPermission);
    setDeviceStatus(nextStatus);
  };

  useEffect(() => {
    queueMicrotask(() => void refreshDeviceStatus().catch(() => setPermission("unsupported")));
  }, []);

  const toggleSetting = (key: NotificationSetting) => {
    setStoreData((current) => current ? {...current, [key]: !current[key]} : current);
  };

  const notifications: Array<{
    id: NotificationSetting;
    label: string;
    description: string;
    icon: typeof ShoppingBag;
  }> = [
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
            {permission === "granted" && deviceStatus?.registered && deviceStatus.active
              ? "This device is registered with LIA and ready to receive push notifications."
              : permission === "granted"
                ? "Device permission is on, but this device is not registered with LIA. Register it again below."
              : permission === "denied"
                ? "Notifications are blocked in this device's settings."
                : permission === "unsupported"
                  ? "Push notifications are not available on this device."
                  : "Enable push notifications to receive alerts outside the LIA app."}
          </p>
          {permission !== "unsupported" && !(permission === "granted" && deviceStatus?.registered && deviceStatus.active) && (
            <button
              type="button"
              disabled={enabling}
              onClick={async () => {
                setEnabling(true);
                try {
                  setDeviceMessage("");
                  await firebaseMessaging.enableNativeNotifications();
                  await refreshDeviceStatus();
                  setDeviceMessage("This device is now registered for LIA notifications.");
                } catch (error) {
                  setDeviceMessage(error instanceof Error ? error.message : "This device could not be registered.");
                } finally {
                  setEnabling(false);
                }
              }}
              className="mt-3 rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              {enabling ? "Registering…" : permission === "granted" ? "Register this device" : "Enable on this device"}
            </button>
          )}
          {permission === "granted" && deviceStatus?.registered && deviceStatus.active && (
            <button type="button" disabled={testing} onClick={async () => {
              setTesting(true); setDeviceMessage("");
              try { await firebaseMessaging.sendTestNotification(); setDeviceMessage("Test notification accepted by the push service."); await refreshDeviceStatus(); }
              catch (error) { setDeviceMessage(error instanceof Error ? error.message : "The test notification could not be sent."); }
              finally { setTesting(false); }
            }} className="mt-3 rounded-full border border-orange-200 bg-white px-3 py-2 text-xs font-bold text-orange-700 disabled:opacity-60">
              {testing ? "Sending…" : "Send test notification"}
            </button>
          )}
          {deviceStatus?.lastRegisteredAt && <p className="mt-2 text-[11px] text-orange-700">Last registered: {new Date(deviceStatus.lastRegisteredAt).toLocaleString()}</p>}
          {deviceMessage && <p className="mt-2 text-xs font-medium text-orange-900">{deviceMessage}</p>}
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
                  type="button"
                  disabled={item.id === "pushNotifications" && !isEnabled && !(permission === "granted" && deviceStatus?.registered && deviceStatus.active)}
                  onClick={() => toggleSetting(item.id)}
                  className={`relative w-12 h-6 rounded-full transition ${
                    isEnabled ? "bg-orange-500" : "bg-gray-300"
                  }`}
                  aria-label={`Toggle ${item.label}`}
                  aria-pressed={isEnabled}
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

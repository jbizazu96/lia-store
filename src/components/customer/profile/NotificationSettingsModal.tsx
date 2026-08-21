"use client";

import {useState} from "react";
import {createPortal} from "react-dom";
import {Bell, Megaphone, Package, PackageCheck, Store, X} from "lucide-react";
import type {
  CustomerNotificationPreferences,
} from "@/services/user/customerProfileClientService";
import type {
  NativeNotificationPreference,
  NotificationDeviceStatus,
  NotificationPermissionState,
} from "@/services/notification/firebaseMessaging";

interface NotificationSettingsModalProps {
  preferences: CustomerNotificationPreferences;
  permission: NotificationPermissionState;
  devicePreference: NativeNotificationPreference;
  deviceStatus: NotificationDeviceStatus | null;
  statusLoading: boolean;
  onClose: () => void;
  onSave: (
    preferences: CustomerNotificationPreferences,
  ) => Promise<CustomerNotificationPreferences>;
  onEnableDeviceNotifications: () => Promise<void>;
  onDeclineDeviceNotifications: () => Promise<void>;
  onSendTestNotification: () => Promise<void>;
}

const settings = [
  {
    key: "orderUpdates" as const,
    title: "Order updates",
    description: "Accepted, delivery, and completed-order updates.",
    icon: PackageCheck,
  },
  {
    key: "promotions" as const,
    title: "Promotions",
    description: "Deals and special offers from LIA.",
    icon: Bell,
  },
  {
    key: "storeUpdates" as const,
    title: "Store updates",
    description: "New stores and important updates from stores you know.",
    icon: Store,
  },
  {
    key: "productUpdates" as const,
    title: "Product updates",
    description: "New products and availability updates from stores you know.",
    icon: Package,
  },
  {
    key: "marketing" as const,
    title: "Marketing",
    description: "LIA news, campaigns, and marketplace announcements.",
    icon: Megaphone,
  },
];

function permissionDescription(
  permission: NotificationPermissionState,
  preference: NativeNotificationPreference,
  registered: boolean,
): string {
  if (permission === "granted" && registered) {
    return "Notifications are enabled. LIA can send the notification types selected below.";
  }

  if (permission === "granted") {
    return "Your device allows notifications, but it is not currently registered with LIA. Register it again below.";
  }

  if (permission === "denied") {
    return "Notifications are currently off. Enable them in the LIA device settings, then return to the app.";
  }

  if (permission === "unsupported") {
    return "Notifications are not available on this device.";
  }

  return preference === "declined"
    ? "You chose not to receive device notifications. You can allow them whenever you are ready."
    : "Allow device notifications to receive alerts outside the app.";
}

function formatStatusDate(value: string | null): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unavailable"
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export function NotificationSettingsModal({
  preferences,
  permission,
  devicePreference,
  deviceStatus,
  statusLoading,
  onClose,
  onSave,
  onEnableDeviceNotifications,
  onDeclineDeviceNotifications,
  onSendTestNotification,
}: NotificationSettingsModalProps) {
  const [values, setValues] = useState(preferences);
  const [saving, setSaving] = useState<keyof CustomerNotificationPreferences | null>(null);
  const [enabling, setEnabling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const deviceNotificationsEnabled =
    permission === "granted" &&
    devicePreference !== "declined" &&
    deviceStatus?.registered === true &&
    deviceStatus.active === true;

  const update = async (
    key: keyof CustomerNotificationPreferences,
  ) => {
    const next = {...values, [key]: !values[key]};
    setSaving(key);
    setError("");

    try {
      const saved = await onSave(next);
      setValues(saved);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to save notification settings.",
      );
    } finally {
      setSaving(null);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[calc(100dvh-env(safe-area-inset-top)-1rem)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Notification settings
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Choose the updates you want to receive.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100"
            aria-label="Close notification settings"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          <div className="rounded-2xl bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-800">
              Device notifications
            </p>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              {statusLoading
                ? "Checking this device with LIA…"
                : permissionDescription(
                    permission,
                    devicePreference,
                    deviceStatus?.registered === true && deviceStatus.active === true,
                  )}
            </p>
            {deviceNotificationsEnabled ? (
              <div className="mt-3">
                <span className="inline-flex rounded-full bg-green-100 px-3 py-2 text-sm font-bold text-green-700">
                  Notifications enabled
                </span>
                <dl className="mt-3 space-y-1 text-xs text-gray-500">
                  <div className="flex justify-between gap-4">
                    <dt>Last registered</dt>
                    <dd className="text-right font-medium text-gray-700">
                      {formatStatusDate(deviceStatus.lastRegisteredAt)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Last accepted by push service</dt>
                    <dd className="text-right font-medium text-gray-700">
                      {formatStatusDate(deviceStatus.lastPushAcceptedAt)}
                    </dd>
                  </div>
                  {deviceStatus.lastPushErrorAt && (
                    <div className="flex justify-between gap-4 text-red-600">
                      <dt>Last delivery error</dt>
                      <dd className="text-right font-medium">
                        {formatStatusDate(deviceStatus.lastPushErrorAt)}
                      </dd>
                    </div>
                  )}
                </dl>
                <button
                  type="button"
                  disabled={testing}
                  onClick={async () => {
                    setTesting(true);
                    setError("");
                    setConfirmation("");
                    try {
                      await onSendTestNotification();
                      setConfirmation("Test sent. Lock your phone or leave LIA to confirm background delivery.");
                    } catch (reason) {
                      setError(reason instanceof Error ? reason.message : "Unable to send a test notification.");
                    } finally {
                      setTesting(false);
                    }
                  }}
                  className="mt-3 rounded-full bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  {testing ? "Sending…" : "Send test notification"}
                </button>
              </div>
            ) : !statusLoading && permission !== "unsupported" && (
              <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={enabling}
                onClick={async () => {
                  setEnabling(true);
                  setError("");
                  try {
                    setConfirmation("");
                    await onEnableDeviceNotifications();
                  } catch (reason) {
                    setError(
                      reason instanceof Error
                        ? reason.message
                        : "Unable to enable device notifications.",
                    );
                  } finally {
                    setEnabling(false);
                  }
                }}
                className="rounded-full bg-orange-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {enabling ? "Please wait…" : permission === "denied" ? "Open device settings" : "Allow notifications"}
              </button>
              <button
                type="button"
                disabled={enabling}
                onClick={async () => {
                  setEnabling(true);
                  setError("");
                  try {
                    await onDeclineDeviceNotifications();
                  } catch (reason) {
                    setError(reason instanceof Error ? reason.message : "Unable to save your choice.");
                  } finally {
                    setEnabling(false);
                  }
                }}
                className="rounded-full bg-white px-3 py-2 text-sm font-bold text-gray-600 ring-1 ring-gray-200 disabled:opacity-60"
              >
                Keep notifications off
              </button>
              </div>
            )}
          </div>

          {error && (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
          {confirmation && (
            <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">
              {confirmation}
            </p>
          )}

          <div className="mt-4 divide-y divide-gray-100">
          {settings.map(({key, title, description, icon: Icon}) => (
            <div key={key} className="flex items-center gap-3 py-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 text-orange-600">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-gray-800">
                  {title}
                </span>
                <span className="block text-xs leading-5 text-gray-500">
                  {description}
                </span>
              </span>
              <button
                type="button"
                disabled={saving !== null}
                onClick={() => void update(key)}
                className={
                  "relative h-7 w-12 rounded-full transition disabled:opacity-60 " +
                  (values[key] ? "bg-green-600" : "bg-gray-200")
                }
                aria-label={`${values[key] ? "Disable" : "Enable"} ${title}`}
                aria-pressed={values[key]}
              >
                <span
                  className={
                    "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition " +
                    (values[key] ? "left-6" : "left-1")
                  }
                />
              </button>
            </div>
          ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

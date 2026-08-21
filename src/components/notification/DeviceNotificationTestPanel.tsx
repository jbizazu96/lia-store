"use client";

import {useCallback, useEffect, useState} from "react";
import {Bell, CheckCircle2, RefreshCw, Send} from "lucide-react";
import {
  firebaseMessaging,
  NATIVE_NOTIFICATION_STATE_EVENT,
  type NotificationDeviceStatus,
  type NotificationPermissionState,
} from "@/services/notification/firebaseMessaging";

function date(value: string | null | undefined): string {
  if (!value) return "Not yet";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Unavailable" : parsed.toLocaleString();
}

export function DeviceNotificationTestPanel({description}: {description: string}) {
  const [permission, setPermission] = useState<NotificationPermissionState>("prompt");
  const [status, setStatus] = useState<NotificationDeviceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<"enable" | "test" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [nextPermission, nextStatus] = await Promise.all([
        firebaseMessaging.getPermissionStatus(),
        firebaseMessaging.getDeviceStatus(),
      ]);
      setPermission(nextPermission);
      setStatus(nextStatus);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to verify this notification device.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
    const update = () => void refresh();
    window.addEventListener(NATIVE_NOTIFICATION_STATE_EVENT, update);
    window.addEventListener("focus", update);
    return () => {
      window.removeEventListener(NATIVE_NOTIFICATION_STATE_EVENT, update);
      window.removeEventListener("focus", update);
    };
  }, [refresh]);

  const registered = permission === "granted" && status?.registered === true && status.active === true;

  return <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100"><div className="flex items-start gap-3"><div className="rounded-full bg-orange-50 p-3"><Bell className="h-5 w-5 text-orange-600" /></div><div><h2 className="font-bold text-slate-900">Device notifications</h2><p className="mt-1 text-sm leading-5 text-slate-500">{description}</p></div></div><div className="mt-4 rounded-xl bg-slate-50 p-4">{loading ? <p className="text-sm text-slate-500">Checking this device with LIA…</p> : registered ? <><p className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1.5 text-sm font-bold text-green-700"><CheckCircle2 className="h-4 w-4" />Notifications enabled</p><dl className="mt-3 space-y-1.5 text-xs text-slate-500"><div className="flex justify-between gap-3"><dt>Last registered</dt><dd className="text-right font-medium text-slate-700">{date(status?.lastRegisteredAt)}</dd></div><div className="flex justify-between gap-3"><dt>Last accepted by push service</dt><dd className="text-right font-medium text-slate-700">{date(status?.lastPushAcceptedAt)}</dd></div>{status?.lastPushErrorAt && <div className="flex justify-between gap-3 text-red-600"><dt>Last delivery error</dt><dd className="text-right font-medium">{date(status.lastPushErrorAt)}</dd></div>}</dl><button disabled={working !== null} onClick={() => {setWorking("test"); setError(""); setMessage(""); void firebaseMessaging.sendTestNotification().then(() => setMessage("Test sent. Lock the phone or leave LIA to verify background delivery.")).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to send a test notification.")).finally(() => {setWorking(null); void refresh();});}} className="mt-3 inline-flex items-center gap-2 rounded-full bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Send className="h-4 w-4" />{working === "test" ? "Sending…" : "Send test notification"}</button></> : <><p className="text-sm leading-5 text-slate-600">{permission === "granted" ? "Device permission is on, but this installation is not actively registered with LIA." : permission === "denied" ? "Notifications are disabled in this device's settings." : permission === "unsupported" ? "Push notifications are unavailable on this device." : "Register this device to receive notifications outside LIA."}</p>{permission !== "unsupported" && <button disabled={working !== null} onClick={() => {setWorking("enable"); setError(""); setMessage(""); void firebaseMessaging.enableNativeNotifications().then(() => refresh()).then(() => setMessage("This device is registered for LIA notifications.")).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to register this device.")).finally(() => setWorking(null));}} className="mt-3 inline-flex items-center gap-2 rounded-full bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><RefreshCw className="h-4 w-4" />{working === "enable" ? "Registering…" : permission === "denied" ? "Open device settings" : "Enable notifications"}</button>}</>}</div>{error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{message && <p className="mt-3 rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</p>}</section>;
}

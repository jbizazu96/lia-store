"use client";

import {useEffect, useState} from "react";
import {createPortal} from "react-dom";
import {Capacitor} from "@capacitor/core";
import {BellRing} from "lucide-react";
import {useAuth} from "@/context/AuthContext";
import {
  firebaseMessaging,
  NATIVE_NOTIFICATION_STATE_EVENT,
} from "@/services/notification/firebaseMessaging";
import {reportClientIssue} from "@/services/monitoring/clientErrorReporter";

export function CustomerPushPermissionPrompt() {
  const {user, loading} = useAuth();
  const [visible, setVisible] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [repairing, setRepairing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (loading || !user) return;
    const eligible = Capacitor.isNativePlatform() ||
      firebaseMessaging.isInstalledWebApp();
    if (!eligible || !firebaseMessaging.isPushConfigured()) return;
    let active = true;
    void Promise.all([
      firebaseMessaging.getPermissionStatus(),
      firebaseMessaging.getDeviceStatus(),
    ]).then(([permission, status]) => {
      if (!active) return;
      if (permission === "granted") {
        const registrationMissing = !status.registered || !status.active;
        const customerDeclined = firebaseMessaging.getNativePreference() === "declined";
        setRepairing(registrationMissing);
        setVisible(registrationMissing && !customerDeclined);
        return;
      }
      setRepairing(false);
      setVisible(
        permission === "prompt" &&
        firebaseMessaging.getNativePreference() === null,
      );
    }).catch(() => {});
    return () => {active = false;};
  }, [loading, refreshKey, user]);

  useEffect(() => {
    const refresh = () => setRefreshKey((value) => value + 1);
    window.addEventListener(NATIVE_NOTIFICATION_STATE_EVENT, refresh);
    return () => window.removeEventListener(NATIVE_NOTIFICATION_STATE_EVENT, refresh);
  }, []);

  if (!visible) return null;

  const accept = async () => {
    setWorking(true);
    setError("");
    try {
      const permission = await firebaseMessaging.enableNativeNotifications();
      if (permission === "granted") {
        setVisible(false);
      } else {
        setError("Notifications were not enabled. You can try again from Profile.");
      }
    } catch (reason) {
      reportClientIssue({
        area: "notifications.permission_registration",
        message: "Push notification registration failed",
        error: reason,
      });
      setError(reason instanceof Error ? reason.message : "Unable to enable notifications.");
    } finally {
      setWorking(false);
    }
  };

  const decline = async () => {
    setWorking(true);
    setError("");
    try {
      await firebaseMessaging.declineNativeNotifications();
      setVisible(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save your choice.");
    } finally {
      setWorking(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(<div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="push-permission-title" className="w-full rounded-t-3xl bg-white px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 shadow-2xl sm:max-w-sm sm:rounded-3xl sm:p-6">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
        <BellRing className="h-7 w-7" />
      </span>
      <h2 id="push-permission-title" className="mt-5 text-xl font-extrabold text-gray-950">{repairing ? "Reconnect LIA notifications" : "Stay updated with LIA"}</h2>
      <p className="mt-2 text-sm leading-6 text-gray-600">{repairing
        ? "Your iPhone still allows notifications, but this installation is no longer registered with LIA. Register it again to continue receiving order and refund updates."
        : "Allow notifications for order progress, delivery updates, refunds, store news, products, and offers. You can turn individual notification types off later in Profile."}</p>
      {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <button type="button" disabled={working} onClick={() => void accept()} className="mt-6 w-full rounded-full bg-orange-600 py-3 text-sm font-bold text-white disabled:opacity-60">{working ? "Please wait…" : repairing ? "Register notifications again" : "Allow notifications"}</button>
      <button type="button" disabled={working} onClick={() => void decline()} className="mt-2 w-full rounded-full py-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 disabled:opacity-60">Not now</button>
    </section>
  </div>, document.body);
}

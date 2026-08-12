"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { usePathname, useRouter } from "next/navigation";
import {useAuth} from "@/context/AuthContext";
import {firebaseMessaging} from "@/services/notification/firebaseMessaging";

export function NativeCustomerBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const {user, loading} = useAuth();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listener = App.addListener("backButton", ({ canGoBack }) => {
      if (pathname === "/home" || pathname === "/login" || pathname === "/") {
        void App.exitApp();
      } else if (canGoBack && window.history.length > 1) {
        router.back();
      } else {
        router.replace("/home");
      }
    });

    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, [pathname, router]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || loading || !user) return;
    let active = true;
    let lastPermission: Awaited<ReturnType<typeof firebaseMessaging.getPermissionStatus>> | null = null;

    void firebaseMessaging.getPermissionStatus().then(async (permission) => {
      if (!active) return;
      lastPermission = permission;
      if (permission === "granted") {
        await firebaseMessaging.recoverNativeRegistration();
      }
    });

    const listener = App.addListener("resume", async () => {
      const permission = await firebaseMessaging.getPermissionStatus();
      const permissionChangedToGranted = permission === "granted" && lastPermission !== "granted";
      lastPermission = permission;
      if (permissionChangedToGranted || (permission === "granted" && firebaseMessaging.getNativePreference() === "accepted")) {
        await firebaseMessaging.recoverNativeRegistration();
      } else {
        window.dispatchEvent(new Event("lia:native-notification-state"));
      }
    });

    return () => {
      active = false;
      void listener.then((handle) => handle.remove());
    };
  }, [loading, user]);

  return null;
}

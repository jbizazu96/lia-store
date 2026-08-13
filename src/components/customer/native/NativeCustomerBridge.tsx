"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { usePathname, useRouter } from "next/navigation";
import {useAuth} from "@/context/AuthContext";
import {firebaseMessaging} from "@/services/notification/firebaseMessaging";
import {toSafeLiaPath} from "@/services/notification/notificationDeepLink";
import {
  isNativeCustomerPath,
  nativeCustomerDestination,
} from "@/services/navigation/nativeCustomerRoutes";
import {reportClientIssue} from "@/services/monitoring/clientErrorReporter";

export function NativeCustomerBridge() {
  const pathname = usePathname();
  const router = useRouter();
  const {user, loading} = useAuth();

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || loading) return;

    if (pathname === "/") {
      router.replace(user ? "/home" : "/login");
    } else if (!isNativeCustomerPath(pathname)) {
      router.replace(user ? "/home" : "/login");
    }
  }, [loading, pathname, router, user]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const guardInternalLink = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      try {
        const destination = new URL(anchor.href, window.location.href);
        if (
          destination.origin === window.location.origin &&
          !isNativeCustomerPath(destination.pathname)
        ) {
          event.preventDefault();
          event.stopPropagation();
          router.replace(user ? "/home" : "/login");
        }
      } catch {
        event.preventDefault();
        reportClientIssue({
          area: "navigation.native_link",
          message: "Native link could not be parsed",
        });
      }
    };

    document.addEventListener("click", guardInternalLink, true);
    return () => document.removeEventListener("click", guardInternalLink, true);
  }, [router, user]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || loading) return;

    const open = (candidate: string) => {
      const fallback = user ? "/home" : "/login";
      const internalPath = toSafeLiaPath(candidate);
      if (!internalPath) {
        reportClientIssue({
          area: "navigation.deep_link",
          message: "Native deep link was rejected",
          metadata: {scheme: candidate.split(":", 1)[0]?.slice(0, 30) ?? "unknown"},
        });
      }
      router.replace(
        internalPath
          ? nativeCustomerDestination(internalPath, fallback)
          : fallback,
      );
    };

    const listener = App.addListener("appUrlOpen", ({url}) => open(url));
    void App.getLaunchUrl().then((launch) => {
      if (launch?.url) open(launch.url);
    });

    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, [loading, router, user]);

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

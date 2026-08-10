"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { usePathname, useRouter } from "next/navigation";

export function NativeCustomerBridge() {
  const pathname = usePathname();
  const router = useRouter();

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

  return null;
}

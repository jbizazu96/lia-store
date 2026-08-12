/*
 * Notification deep links are deliberately limited to LIA routes.  A push
 * payload must never be able to turn a notification tap into an external
 * redirect.
 */

import {Capacitor} from "@capacitor/core";
import {
  nativeCustomerDestination,
} from "@/services/navigation/nativeCustomerRoutes";

function configuredAppHost(): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!configured) {
    return null;
  }

  try {
    return new URL(configured).host;
  } catch {
    return null;
  }
}

export function toSafeLiaPath(
  candidate: unknown,
): string | null {
  if (typeof candidate !== "string" || !candidate.trim()) {
    return null;
  }

  const value = candidate.trim();

  if (value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  try {
    const url = new URL(value);

    if (url.protocol === "lia:") {
      const path = `/${url.host}${url.pathname}`.replace(/\/+/g, "/");
      return `${path}${url.search}${url.hash}`;
    }

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    const browserHost =
      typeof window === "undefined"
        ? null
        : window.location.host;
    const appHost = configuredAppHost();

    if (url.host !== browserHost && url.host !== appHost) {
      return null;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/**
 * Order notification documents carry the Firestore order ID separately from
 * their deep link. Prefer that structured field so older malformed or missing
 * links still open the customer's order-details route.
 */
export function customerNotificationPath(
  deepLink: unknown,
  orderId: unknown,
): string | null {
  if (
    typeof orderId === "string" &&
    orderId.trim() &&
    !orderId.includes("/") &&
    !orderId.includes("\\")
  ) {
    return `/orders/${encodeURIComponent(orderId.trim())}`;
  }

  return toSafeLiaPath(deepLink);
}

export function openLiaDeepLink(
  candidate: unknown,
  fallback = "/home",
): void {
  if (typeof window === "undefined") {
    return;
  }

  const safePath = toSafeLiaPath(candidate) ?? fallback;
  window.location.assign(
    Capacitor.isNativePlatform()
      ? nativeCustomerDestination(safePath, fallback)
      : safePath,
  );
}

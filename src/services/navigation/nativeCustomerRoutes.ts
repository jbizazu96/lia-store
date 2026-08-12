/*
 * The App Store and Play Store builds are customer-only shells. The hosted
 * website still serves every LIA workspace, but a Capacitor navigation may
 * enter only these public/authentication and customer shopping routes.
 */

const exactCustomerPaths = new Set([
  "/",
  "/cart",
  "/checkout",
  "/checkout/payment-result",
  "/help",
  "/home",
  "/legal",
  "/login",
  "/notifications",
  "/offline",
  "/orders",
  "/profile",
  "/register",
  "/reset-password",
  "/search",
  "/verify-email",
]);

const reservedStoreWorkspaceSegments = new Set([
  "analytics",
  "dashboard",
  "earnings",
  "notifications",
  "onboarding",
  "pending-approval",
  "products",
  "settings",
  "store-orders",
]);

function cleanPathname(pathname: string): string | null {
  if (!pathname.startsWith("/") || pathname.startsWith("//") || pathname.includes("\\")) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(pathname);
    if (decoded.split("/").includes("..")) return null;
  } catch {
    return null;
  }

  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

export function isNativeCustomerPath(pathname: string): boolean {
  const clean = cleanPathname(pathname);
  if (!clean) return false;
  if (exactCustomerPaths.has(clean)) return true;

  if (/^\/orders\/[^/]+$/.test(clean)) return true;
  if (/^\/product\/[^/]+$/.test(clean)) return true;

  const storeMatch = clean.match(/^\/store\/([^/]+)(?:\/(info|search|category\/[^/]+))?$/);
  if (!storeMatch) return false;

  return !reservedStoreWorkspaceSegments.has(storeMatch[1].toLowerCase());
}

export function nativeCustomerDestination(
  candidate: string,
  fallback = "/home",
): string {
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, "https://lia.invalid");
    return isNativeCustomerPath(parsed.pathname)
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : fallback;
  } catch {
    return fallback;
  }
}

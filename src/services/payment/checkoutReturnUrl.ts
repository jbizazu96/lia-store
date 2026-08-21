import {
  Capacitor,
} from "@capacitor/core";

/*
 * Stripe must return to an HTTPS app origin after a redirect-based payment
 * method (3DS, bank redirects, etc.). A bundled Capacitor WebView has a
 * capacitor:// origin, which Stripe cannot use. Native builds therefore use
 * the configured public app URL; browsers keep their current origin so local
 * development continues to work without production configuration.
 */
function returnOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "https://www.liamarketplace.com";

  if (Capacitor.isNativePlatform() && configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:") {
        return url.origin;
      }
    } catch {
      /* Fall through to the active origin for local native development. */
    }
  }

  return window.location.origin;
}

export function checkoutPaymentReturnUrl(
  orderId: string,
  checkoutSessionId: string,
): string {
  const resultUrl = new URL(
    "/checkout/payment-result",
    returnOrigin(),
  );

  resultUrl.searchParams.set("orderId", orderId);
  resultUrl.searchParams.set("checkoutSessionId", checkoutSessionId);

  return resultUrl.toString();
}

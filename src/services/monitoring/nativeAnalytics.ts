import {FirebaseAnalytics} from "@capacitor-firebase/analytics";
import {Capacitor} from "@capacitor/core";

type NativeAnalyticsValue = string | number | boolean;

/** Native-only operational analytics; never include customer-entered content. */
export function recordNativeAnalyticsEvent(
  name: "lia_native_startup" | "lia_deep_link_open" | "lia_deep_link_failed",
  params: Record<string, NativeAnalyticsValue> = {},
): void {
  if (!Capacitor.isNativePlatform()) return;
  void FirebaseAnalytics.logEvent({name, params}).catch(() => undefined);
}

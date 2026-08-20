import app from "@/lib/firebase";
import {reportClientIssue} from "@/services/monitoring/clientErrorReporter";

interface PerformanceTraceHandle {
  stop: (attributes?: Record<string, string>) => void;
}

/** Initial production budgets. Firebase Performance provides the real p50
 * and p75 distributions; these limits additionally surface slow individual
 * experiences in LIA's existing diagnostic stream. */
const CUSTOMER_PERFORMANCE_BUDGET_MS: Record<string, number> = {
  customer_auth_ready: 1_500,
  customer_access_ready: 2_500,
  customer_legal_ready: 2_000,
  customer_home_profile: 2_000,
  customer_home_catalog: 2_000,
  customer_home_store_discovery: 4_000,
  customer_store_ready: 3_000,
  customer_product_ready: 3_000,
  customer_search_ready: 2_500,
  customer_cart_pricing_ready: 2_500,
  customer_checkout_data_ready: 2_500,
  customer_checkout_pricing_ready: 2_500,
  customer_checkout_payment_prepared: 5_000,
};

/**
 * Records customer critical-path durations in Firebase Performance when the
 * browser supports it. Performance instrumentation must never delay or fail
 * the shopping experience, so the SDK is loaded asynchronously.
 */
export function startCustomerPerformanceTrace(name: string): PerformanceTraceHandle {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  let stopped = false;
  let attributes: Record<string, string> = {};
  const firebaseTrace = typeof window === "undefined"
    ? Promise.resolve(null)
    : import("firebase/performance")
      .then(({getPerformance, trace}) => {
        const value = trace(getPerformance(app), name);
        value.start();
        return value;
      })
      .catch(() => null);

  return {
    stop(nextAttributes = {}) {
      if (stopped) return;
      stopped = true;
      const navigatorValue = typeof navigator !== "undefined" ? navigator : null;
      const userAgent = navigatorValue?.userAgent ?? "";
      const platform = /android/i.test(userAgent)
        ? "android"
        : /iphone|ipad|ipod/i.test(userAgent)
          ? "ios"
          : "web";
      const connection = navigatorValue as Navigator & {
        connection?: {effectiveType?: string};
        deviceMemory?: number;
      };
      attributes = {
        platform,
        network_type: connection?.connection?.effectiveType ?? "unknown",
        device_memory_gb: connection?.deviceMemory
          ? String(connection.deviceMemory)
          : "unknown",
        ...nextAttributes,
      };
      const durationMs = Math.round(
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt
      );
      const budgetMs = CUSTOMER_PERFORMANCE_BUDGET_MS[name];
      if (budgetMs !== undefined && durationMs > budgetMs) {
        reportClientIssue({
          area: `performance.${name}`,
          message: `${name} exceeded its ${budgetMs}ms performance budget`,
          severity: "warning",
          metadata: {durationMs, budgetMs, ...attributes},
        });
      }
      void firebaseTrace.then((value) => {
        if (!value) return;
        Object.entries(attributes).slice(0, 5).forEach(([key, attribute]) =>
          value.putAttribute(key.slice(0, 40), attribute.slice(0, 100))
        );
        value.putMetric("duration_ms", durationMs);
        value.stop();
      });
    },
  };
}

import app from "@/lib/firebase";
import {reportClientIssue} from "@/services/monitoring/clientErrorReporter";

const BUDGETS: Record<string, number> = {
  store_workspace_ready: 2_500,
  store_dashboard_ready: 3_000,
  store_products_ready: 2_500,
  store_orders_ready: 3_000,
  store_financials_ready: 4_000,
  store_analytics_ready: 3_500,
};

export function startStorePerformanceTrace(name: string) {
  const startedAt = typeof performance === "undefined" ? Date.now() : performance.now();
  let stopped = false;
  const firebaseTrace = typeof window === "undefined" ? Promise.resolve(null) : import("firebase/performance")
    .then(({getPerformance, trace}) => {
      const value = trace(getPerformance(app), name);
      value.start();
      return value;
    })
    .catch(() => null);
  return {
    stop(attributes: Record<string, string> = {}) {
      if (stopped) return;
      stopped = true;
      const durationMs = Math.round((typeof performance === "undefined" ? Date.now() : performance.now()) - startedAt);
      const budgetMs = BUDGETS[name];
      if (budgetMs && durationMs > budgetMs) reportClientIssue({
        area: `performance.${name}`,
        message: `${name} exceeded its ${budgetMs}ms performance budget`,
        severity: "warning",
        metadata: {durationMs, budgetMs, ...attributes},
      });
      void firebaseTrace.then((value) => {
        if (!value) return;
        Object.entries(attributes).slice(0, 5).forEach(([key, item]) => value.putAttribute(key.slice(0, 40), item.slice(0, 100)));
        value.putMetric("duration_ms", durationMs);
        value.stop();
      });
    },
  };
}

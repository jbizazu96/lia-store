import app from "@/lib/firebase";

interface PerformanceTraceHandle {
  stop: (attributes?: Record<string, string>) => void;
}

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
      attributes = nextAttributes;
      const durationMs = Math.round(
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt
      );
      void firebaseTrace.then((value) => {
        if (!value) return;
        Object.entries(attributes).forEach(([key, attribute]) =>
          value.putAttribute(key.slice(0, 40), attribute.slice(0, 100))
        );
        value.putMetric("duration_ms", durationMs);
        value.stop();
      });
    },
  };
}

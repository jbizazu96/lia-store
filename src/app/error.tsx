"use client";

import {
  useEffect,
} from "react";
import {
  RefreshCw,
} from "lucide-react";
import {reportClientIssue} from "@/services/monitoring/clientErrorReporter";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application route error:", error);
    reportClientIssue({
      area: "react.route_error_boundary",
      message: error.message || "Application route failed to render",
      severity: "fatal",
      error,
      metadata: {digest: error.digest ?? ""},
    });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 text-center">
      <section className="max-w-sm rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-orange-600">
          <RefreshCw className="h-7 w-7" />
        </div>
        <h1 className="mt-5 text-xl font-bold text-gray-900">
          Something didn&apos;t load
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Your information is safe. Please try loading this screen again.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
      </section>
    </main>
  );
}

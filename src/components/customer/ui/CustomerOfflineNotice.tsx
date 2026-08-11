"use client";

import { useEffect, useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";

/*
 * LIA requires a live connection because prices, inventory, store status,
 * delivery availability, and payment eligibility must be current. Hide the
 * customer workflow while offline instead of presenting cached data as live.
 */
export function CustomerOfflineNotice() {
  const [isOffline, setIsOffline] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const updateConnection = () => setIsOffline(!navigator.onLine);

    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);

    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  if (!isOffline) {
    return null;
  }

  const retryConnection = () => {
    setRetrying(true);

    if (navigator.onLine) {
      window.location.reload();
      return;
    }

    window.setTimeout(() => setRetrying(false), 500);
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-white px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]"
      role="alert"
      aria-live="assertive"
    >
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-orange-50 text-orange-600">
          <WifiOff className="h-8 w-8" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-xl font-extrabold text-gray-900">
          Internet connection required
        </h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Check your connection and try again. LIA needs internet access to
          show current prices, inventory, delivery availability, and orders.
        </p>
        <button
          type="button"
          onClick={retryConnection}
          disabled={retrying}
          className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-orange-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-wait disabled:opacity-70"
        >
          <RefreshCw
            className={"h-4 w-4 " + (retrying ? "animate-spin" : "")}
            aria-hidden="true"
          />
          {retrying ? "Checking connection..." : "Try again"}
        </button>
      </div>
    </div>
  );
}

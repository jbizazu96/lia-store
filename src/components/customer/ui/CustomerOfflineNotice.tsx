"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/* Keeps every customer route honest about connectivity without blocking cached content. */
export function CustomerOfflineNotice() {
  const [isOffline, setIsOffline] = useState(false);

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

  return (
    <div
      className="fixed inset-x-4 top-3 z-[130] mx-auto flex max-w-md items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-center text-sm font-semibold text-amber-900 shadow-lg backdrop-blur-md"
      role="status"
      aria-live="polite"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      You&apos;re offline. Showing saved content where available.
    </div>
  );
}

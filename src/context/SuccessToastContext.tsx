"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, X } from "lucide-react";

interface SuccessToastContextValue {
  showSuccess: (message: string, duration?: number) => void;
}

const SuccessToastContext = createContext<SuccessToastContextValue | null>(
  null
);

export function SuccessToastProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const dismiss = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setMessage(null);
  }, []);

  const showSuccess = useCallback((nextMessage: string, duration = 5000) => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    setMessage(nextMessage);
    timeoutRef.current = window.setTimeout(dismiss, duration);
  }, [dismiss]);

  return (
    <SuccessToastContext.Provider value={{ showSuccess }}>
      {children}

      {message && (
        <div
          className="fixed inset-x-4 top-4 z-[110] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-green-200 bg-green-600 px-4 py-3 text-white shadow-xl"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="flex-1 text-sm font-semibold">{message}</p>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg p-1 transition hover:bg-white/15"
            aria-label="Dismiss confirmation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </SuccessToastContext.Provider>
  );
}

export function useSuccessToast() {
  const context = useContext(SuccessToastContext);

  if (!context) {
    throw new Error(
      "useSuccessToast must be used inside SuccessToastProvider."
    );
  }

  return context;
}

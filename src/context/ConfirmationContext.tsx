"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmationOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface ActiveConfirmation extends ConfirmationOptions {
  resolve: (confirmed: boolean) => void;
}

const ConfirmationContext = createContext<{
  confirm: (options: ConfirmationOptions) => Promise<boolean>;
} | null>(null);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [activeConfirmation, setActiveConfirmation] =
    useState<ActiveConfirmation | null>(null);

  const confirm = (options: ConfirmationOptions) =>
    new Promise<boolean>((resolve) => {
      setActiveConfirmation({ ...options, resolve });
    });

  const close = (confirmed: boolean) => {
    activeConfirmation?.resolve(confirmed);
    setActiveConfirmation(null);
  };

  return (
    <ConfirmationContext.Provider value={{ confirm }}>
      {children}
      {activeConfirmation && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
              activeConfirmation.destructive ? "bg-red-100" : "bg-orange-100"
            }`}>
              <AlertTriangle className={`h-8 w-8 ${
                activeConfirmation.destructive ? "text-red-600" : "text-orange-600"
              }`} />
            </div>
            <h2 className="text-center text-xl font-bold text-gray-800">
              {activeConfirmation.title ?? "Confirm action"}
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              {activeConfirmation.message}
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => close(false)}
                className="flex-1 rounded-xl border border-gray-200 py-3 font-medium text-gray-600 transition hover:bg-gray-50"
              >
                {activeConfirmation.cancelLabel ?? "Keep editing"}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                className={`flex-1 rounded-xl py-3 font-semibold text-white transition ${
                  activeConfirmation.destructive
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-orange-500 hover:bg-orange-600"
                }`}
              >
                {activeConfirmation.confirmLabel ?? "Continue"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmationContext.Provider>
  );
}

export function useConfirmation() {
  const context = useContext(ConfirmationContext);

  if (!context) {
    throw new Error("useConfirmation must be used inside ConfirmationProvider.");
  }

  return context;
}

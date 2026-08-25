"use client";
import {createContext, useContext, useRef, useState} from "react";
import {AdminConfirmDialog} from "@/components/admin/AdminConfirmDialog";

interface Options {title: string; description: string; confirmationLabel?: string; tone?: "danger" | "warning" | "primary"}
const Context = createContext<((options: Options) => Promise<boolean>) | null>(null);
export function AdminConfirmationProvider({children}: {children: React.ReactNode}) {
  const [options, setOptions] = useState<Options | null>(null); const resolver = useRef<((result: boolean) => void) | null>(null);
  const confirm = (next: Options) => new Promise<boolean>((resolve) => { resolver.current?.(false); resolver.current = resolve; setOptions(next); });
  const finish = (result: boolean) => { resolver.current?.(result); resolver.current = null; setOptions(null); };
  return <Context.Provider value={confirm}>{children}<AdminConfirmDialog open={Boolean(options)} title={options?.title ?? "Confirm action"} description={options?.description ?? ""} confirmationLabel={options?.confirmationLabel} tone={options?.tone} onCancel={() => finish(false)} onConfirm={() => finish(true)}/></Context.Provider>;
}
export function useAdminConfirmation() { const value = useContext(Context); if (!value) throw new Error("useAdminConfirmation must be used inside AdminConfirmationProvider."); return value; }

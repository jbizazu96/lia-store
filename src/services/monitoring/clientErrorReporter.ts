import {Capacitor} from "@capacitor/core";
import {httpsCallable} from "firebase/functions";
import {functions} from "@/lib/firebase";

export type ClientIssueSeverity = "warning" | "error" | "fatal";

interface ClientIssue {
  area: string;
  message: string;
  severity?: ClientIssueSeverity;
  error?: unknown;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

const recentReports = new Map<string, number>();
const REPORT_DEDUPE_MS = 60_000;

function errorDetails(value: unknown): {message: string; stack: string} {
  if (value instanceof Error) {
    return {message: value.message, stack: value.stack ?? ""};
  }
  return {
    message: typeof value === "string" ? value : "Unexpected client failure",
    stack: "",
  };
}

function safePath(): string {
  if (typeof window === "undefined") return "";
  // Route names are sufficient for diagnostics; query strings can contain
  // customer search text or provider state and should not be retained.
  return window.location.pathname.slice(0, 500);
}

/** Fire-and-forget reporting must never interfere with the customer action. */
export function reportClientIssue(issue: ClientIssue): void {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "production") return;
  const details = errorDetails(issue.error);
  const message = (issue.message || details.message).trim().slice(0, 500);
  const key = `${issue.area}:${message}`;
  const lastReport = recentReports.get(key) ?? 0;
  if (Date.now() - lastReport < REPORT_DEDUPE_MS) return;
  recentReports.set(key, Date.now());

  const metadata = Object.fromEntries(Object.entries(issue.metadata ?? {}).flatMap(([name, value]) =>
    value === null || value === undefined ? [] : [[name, value]]
  ));
  const callable = httpsCallable(functions, "reportClientError");
  void callable({
    area: issue.area,
    message,
    severity: issue.severity ?? "error",
    stack: details.stack,
    path: safePath(),
    platform: Capacitor.isNativePlatform()
      ? `capacitor-${Capacitor.getPlatform()}`
      : "web",
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
    online: navigator.onLine,
    metadata,
  }).catch(() => undefined);
}

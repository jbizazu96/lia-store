import {Capacitor} from "@capacitor/core";
import {FirebaseCrashlytics} from "@capacitor-firebase/crashlytics";

interface NativeCrashIssue {
  area: string;
  message: string;
  severity: "warning" | "error" | "fatal";
  error?: unknown;
  path: string;
  appVersion?: string | null;
}

let initialized = false;

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

function errorStack(error: unknown): string {
  return error instanceof Error ? error.stack ?? "" : "";
}

function crashlyticsFrames(stack: string) {
  return stack
    .split("\n")
    .slice(1, 65)
    .map((line) => ({functionName: line.trim().slice(0, 500)}));
}

/**
 * Native Crashlytics is complementary to the Firestore-backed web reporter.
 * The native SDK captures process-level failures, including failures that can
 * occur before the hosted Next.js application has finished loading.
 */
export async function initializeNativeCrashReporting(
  userId: string | null,
): Promise<void> {
  if (!isNative()) return;

  if (!initialized) {
    await FirebaseCrashlytics.setEnabled({enabled: true});
    await FirebaseCrashlytics.setCustomKey({
      key: "app_surface",
      value: "customer",
      type: "string",
    });
    await FirebaseCrashlytics.setCustomKey({
      key: "hosted_shell",
      value: true,
      type: "boolean",
    });
    const version = process.env.NEXT_PUBLIC_APP_VERSION?.trim();
    if (version) {
      await FirebaseCrashlytics.setCustomKey({
        key: "web_app_version",
        value: version.slice(0, 100),
        type: "string",
      });
    }
    initialized = true;
  }

  // Firebase treats an empty value as clearing the previously assigned user.
  await FirebaseCrashlytics.setUserId({userId: userId ?? ""});
}

export function recordNativeClientIssue(issue: NativeCrashIssue): void {
  if (!isNative()) return;

  const stacktrace = crashlyticsFrames(errorStack(issue.error));
  void FirebaseCrashlytics.recordException({
    message: `[${issue.severity}] ${issue.area}: ${issue.message}`.slice(0, 1000),
    ...(stacktrace.length > 0 ? {stacktrace} : {}),
    keysAndValues: [
      {key: "area", value: issue.area.slice(0, 100), type: "string"},
      {key: "severity", value: issue.severity, type: "string"},
      {key: "route", value: issue.path.slice(0, 500), type: "string"},
      ...(issue.appVersion
        ? [{
            key: "web_app_version",
            value: issue.appVersion.slice(0, 100),
            type: "string" as const,
          }]
        : []),
    ],
  }).catch(() => undefined);
}

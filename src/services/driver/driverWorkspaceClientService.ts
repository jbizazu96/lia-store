/* Browser client for the authenticated driver workspace API. */
import { auth } from "@/lib/firebase";
import type { DriverNotification, DriverPayment, DriverPaymentTotals, DriverProfile, DriverWorkspaceSummary } from "@/types/driverWorkspace";

/*
 * Preserve the HTTP status so route guards can distinguish an expired
 * session from a server-side outage or missing deployment configuration.
 */
export class DriverWorkspaceClientError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "DriverWorkspaceClientError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("Sign in again to access the driver app.");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${await user.getIdToken()}`);
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) {
    throw new DriverWorkspaceClientError(
      payload.error ?? "The driver request could not be completed.",
      response.status
    );
  }
  return payload;
}

export const driverWorkspaceClientService = {
  getEntry: () => request<{ hasApplication: boolean; onboardingCompleted: boolean; onboardingStep: string; isApproved: boolean }>("/api/driver/entry"),
  getSummary: () => request<DriverWorkspaceSummary>("/api/driver/workspace"),
  updateProfile: (input: DriverProfile) => request<DriverWorkspaceSummary>("/api/driver/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }),
  getPayments: () => request<{ payments: DriverPayment[]; totals: DriverPaymentTotals }>("/api/driver/payments"),
  getNotifications: () => request<{ notifications: DriverNotification[] }>("/api/driver/notifications"),
  markNotificationRead: (notificationId: string) => request("/api/driver/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationId }) }),
  clearNotifications: () => request("/api/driver/notifications", { method: "DELETE" }),
  submitDocumentReplacement: (input: { field: "drivers-license-front" | "drivers-license-back" | "vehicle-insurance" | "vehicle-registration"; expirationDate: string; issuingState?: string; provider?: string }) => request("/api/driver/documents", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }),
};

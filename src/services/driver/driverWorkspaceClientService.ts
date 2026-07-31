/*
|--------------------------------------------------------------------------
| Driver Workspace Client Service
|--------------------------------------------------------------------------
|
| The driver UI calls Firebase callable Functions only. Functions verify the
| Firebase session and use Admin SDK access for protected driver records.
|
*/

import {
  httpsCallable,
} from "firebase/functions";
import {
  functions,
} from "@/lib/firebase";
import type {
  DriverNotification,
  DriverPayment,
  DriverPaymentTotals,
  DriverProfile,
  DriverWorkspaceSummary,
} from "@/types/driverWorkspace";

export class DriverWorkspaceClientError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "DriverWorkspaceClientError";
  }
}

function statusForFunctionError(code: unknown): number {
  return code === "functions/unauthenticated" ||
    code === "functions/permission-denied"
    ? 403
    : 500;
}

async function call<T>(
  name: string,
  data?: unknown
): Promise<T> {
  try {
    const callable = httpsCallable<unknown, T>(
      functions,
      name
    );
    const result = await callable(data);
    return result.data;
  } catch (error) {
    const functionError = error as {
      code?: unknown;
      message?: unknown;
    };

    throw new DriverWorkspaceClientError(
      typeof functionError.message === "string"
        ? functionError.message
        : "The driver request could not be completed.",
      statusForFunctionError(functionError.code)
    );
  }
}

export const driverWorkspaceClientService = {
  getEntry: () => call<{
    hasApplication: boolean;
    onboardingCompleted: boolean;
    onboardingStep: string;
    isApproved: boolean;
  }>("getDriverWorkspaceEntry"),

  getSummary: () =>
    call<DriverWorkspaceSummary>(
      "getDriverWorkspaceSummary"
    ),

  updateProfile: (profile: DriverProfile) =>
    call<DriverWorkspaceSummary>(
      "updateDriverWorkspaceProfile",
      {profile}
    ),

  getPayments: () =>
    call<{
      payments: DriverPayment[];
      totals: DriverPaymentTotals;
    }>("getDriverWorkspacePayments"),

  getNotifications: () =>
    call<{notifications: DriverNotification[]}>(
      "getDriverWorkspaceNotifications"
    ),

  markNotificationRead: (notificationId: string) =>
    call(
      "markDriverWorkspaceNotificationRead",
      {notificationId}
    ),

  clearNotifications: () =>
    call("clearDriverWorkspaceNotifications"),

  submitDocumentReplacement: (input: {
    field:
      | "drivers-license-front"
      | "drivers-license-back"
      | "vehicle-insurance"
      | "vehicle-registration";
    expirationDate: string;
    issuingState?: string;
    provider?: string;
  }) =>
    call(
      "submitDriverDocumentReplacement",
      input
    ),
};

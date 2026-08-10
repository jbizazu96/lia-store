/*
|--------------------------------------------------------------------------
| Admin Workspace Client Service
|--------------------------------------------------------------------------
|
| Admin pages call protected Firebase Functions. The browser does not read
| private store, driver, payment, or administrative Firestore collections.
|
*/

import {
  httpsCallable,
} from "firebase/functions";
import {
  functions,
} from "@/lib/firebase";
import {
  loadCached,
} from "@/services/cache/clientDataCache";
import type {
  AdminApplicationListItem,
  AdminApplicationCounts,
  AdminApplicationStatus,
  AdminOrderDetail,
  AdminOrderListItem,
  AdminFinanceOverview,
  AdminLiaFinanceReport,
  AdminCommissionSettings,
  AdminAccountDeletionRequestCounts,
  AdminAccountDeletionRequestDetail,
  AdminAccountDeletionRequestListItem,
  AdminAccountDeletionStatus,
  AdminDriverApplicationDetail,
  AdminStoreApplicationDetail,
  AdminWorkspaceEntry,
  AdminWorkspaceOverview,
  AdminStoreApplicationPolicy,
  AdminDriverApplicationPolicy,
  AdminOrderDeliveryPolicy,
  AdminCustomerDetail,
  AdminCustomerListItem,
  AdminPlatformReport,
  AdminAuditLog,
  AdminRefundClaimDetail,
  AdminRefundClaimListItem,
} from "@/types/adminWorkspace";
import type {HomePromotion} from "@/types/homePromotion";

export class AdminWorkspaceClientError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "AdminWorkspaceClientError";
  }
}

async function call<T>(name: string, data?: unknown): Promise<T> {
  try {
    const result = await httpsCallable<unknown, T>(
      functions,
      name
    )(data);

    return result.data;
  } catch (error) {
    const functionError = error as {
      code?: unknown;
      message?: unknown;
    };

    throw new AdminWorkspaceClientError(
      typeof functionError.message === "string"
        ? functionError.message
        : "The admin request could not be completed.",
      functionError.code === "functions/unauthenticated" ||
        functionError.code === "functions/permission-denied"
        ? 403
        : 500
    );
  }
}

async function imageBase64(
  file: File,
): Promise<string> {
  const bytes = new Uint8Array(
    await file.arrayBuffer(),
  );
  const chunkSize = 0x8000;
  let binary = "";

  for (
    let index = 0;
    index < bytes.length;
    index += chunkSize
  ) {
    binary += String.fromCharCode(
      ...bytes.subarray(
        index,
        index + chunkSize,
      ),
    );
  }

  return window.btoa(binary);
}

export const adminWorkspaceClientService = {
  uploadStoreBrandingImage: async (
    input: {
      storeId: string;
      field: "logo" | "banner";
      file: File;
    },
  ) => {
    const {
      storeId,
      field,
      file,
    } = input;

    if (
      !file.type.match(
        /^image\/(jpeg|png|webp|avif)$/,
      )
    ) {
      throw new Error(
        "Choose a JPG, PNG, WebP, or AVIF image.",
      );
    }

    if (
      file.size <= 0 ||
      file.size > 5 * 1024 * 1024
    ) {
      throw new Error(
        "Store branding images must be between 1 byte and 5 MB.",
      );
    }

    const extension = file.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "";

    return call<{
      accepted: boolean;
      originalPath: string;
    }>(
      "uploadAdminStoreBrandingImage",
      {
        storeId,
        field,
        extension,
        contentType: file.type,
        base64: await imageBase64(file),
      },
    );
  },

  getEntry: () => loadCached(
    "admin-workspace-entry",
    () => call<AdminWorkspaceEntry>("getAdminWorkspaceEntry"),
    {ttlMs: 15_000}
  ),

  getOverview: () => loadCached(
    "admin-workspace-overview",
    () => call<AdminWorkspaceOverview>("getAdminWorkspaceOverview"),
    {ttlMs: 15_000}
  ),

  getStoreApplications: (status: AdminApplicationStatus = "pending_review") =>
    call<{applications: AdminApplicationListItem[]; counts: AdminApplicationCounts}>(
      "getAdminStoreApplications",
      {status}
    ),

  getDriverApplications: (status: AdminApplicationStatus = "pending_review") =>
    call<{applications: AdminApplicationListItem[]; counts: AdminApplicationCounts}>(
      "getAdminDriverApplications",
      {status}
    ),

  getStoreApplication: (storeId: string) =>
    call<AdminStoreApplicationDetail>(
      "getAdminStoreApplication",
      {storeId}
    ),

  getDriverApplication: (driverId: string) =>
    call<AdminDriverApplicationDetail>(
      "getAdminDriverApplication",
      {driverId}
    ),

  decideDocument: (input: {
    type: "store" | "driver";
    applicationId: string;
    documentKey: string;
    decision: "approved" | "rejected";
    reason?: string;
  }) => call<{success: boolean}>("decideAdminApplicationDocument", input),

  decideApplication: (input: {
    type: "store" | "driver";
    applicationId: string;
    decision: "approved" | "rejected";
    reason?: string;
  }) => call<{success: boolean}>("decideAdminApplication", input),

  setStoreApproval: (storeId: string, isApproved: boolean) =>
    call<{success: boolean}>("setAdminStoreApproval", {storeId, isApproved}),

  setDriverApproval: (driverId: string, isApproved: boolean) =>
    call<{success: boolean}>("setAdminDriverApproval", {driverId, isApproved}),

  activateStore: (storeId: string, isActive: boolean) =>
    call<{success: boolean}>("activateAdminStore", {storeId, isActive}),

  setStoreSuspension: (
    storeId: string,
    isSuspended: boolean,
    reason?: string,
  ) => call<{success: boolean}>("setAdminStoreSuspension", {
    storeId,
    isSuspended,
    ...(reason ? {reason} : {}),
  }),

  setDriverSuspension: (
    driverId: string,
    isSuspended: boolean,
    reason?: string,
  ) => call<{success: boolean}>("setAdminDriverSuspension", {
    driverId,
    isSuspended,
    ...(reason ? {reason} : {}),
  }),

  setDriverApprovedRadius: (
    driverId: string,
    approvedRadiusMiles: number,
  ) => call<{success: boolean}>("setAdminDriverApprovedRadius", {
    driverId,
    approvedRadiusMiles,
  }),

  getAccountDeletionRequests: (
    status: AdminAccountDeletionStatus = "pending_review",
    cursor?: string,
  ) => call<{
    requests: AdminAccountDeletionRequestListItem[];
    counts: AdminAccountDeletionRequestCounts;
    nextCursor: string | null;
  }>("getAdminAccountDeletionRequests", {status, ...(cursor ? {cursor} : {})}),

  getAccountDeletionRequest: (requestId: string) =>
    call<AdminAccountDeletionRequestDetail>(
      "getAdminAccountDeletionRequest",
      {requestId}
    ),

  decideAccountDeletionRequest: (input: {
    requestId: string;
    decision: "approved" | "rejected" | "more_information_required";
    notes?: string;
    scheduledDeletionDate?: string;
  }) => call<{
    success: boolean;
    scheduledDeletionAt: string | null;
  }>("decideAdminAccountDeletionRequest", input),

  retryAccountDeletionRequest: (requestId: string) =>
    call<{success: boolean}>("retryAdminAccountDeletionRequest", {requestId}),

  reinstateAccountDeletionRequest: (requestId: string) =>
    call<{success: boolean}>("reinstateAdminAccountDeletionRequest", {requestId}),

  getOrders: (input?: {status?: string; exception?: string}) =>
    call<{orders: AdminOrderListItem[]}>("getAdminOrders", input),

  getOrder: (orderId: string) =>
    call<AdminOrderDetail>("getAdminOrder", {orderId}),

  getFinanceOverview: () =>
    call<AdminFinanceOverview>("getAdminFinanceOverview"),

  getLiaFinanceReport: () =>
    call<AdminLiaFinanceReport>("getAdminLiaFinanceReport"),
  getCommissionSettings: () => call<AdminCommissionSettings>("getAdminCommissionSettings"),
  getMarketplacePricingPolicy: () => call<{policy: Record<string, number> | null}>("getAdminMarketplacePricingPolicy"),
  saveDefaultStoreCommission: (basisPoints: number) => call<{success: boolean}>("saveAdminDefaultStoreCommission", {basisPoints}),
  saveDefaultDriverCommission: (basisPoints: number) => call<{success: boolean}>("saveAdminDefaultDriverCommission", {basisPoints}),
  saveMarketplacePricingPolicy: (policy: Record<string, number>) => call<{success: boolean}>("saveAdminMarketplacePricingPolicy", {policy}),
  saveStoreCommissionOverride: (storeId: string, basisPoints: number | null) => call<{success: boolean}>("saveAdminStoreCommissionOverride", {storeId, basisPoints}),
  getStoreApplicationPolicy: () => call<{policy: AdminStoreApplicationPolicy}>("getAdminStoreApplicationPolicy"),
  saveStoreApplicationPolicy: (policy: AdminStoreApplicationPolicy) => call<{success: boolean}>("saveAdminStoreApplicationPolicy", {policy}),
  getDriverApplicationPolicy: () => call<{policy: AdminDriverApplicationPolicy}>("getAdminDriverApplicationPolicy"),
  saveDriverApplicationPolicy: (policy: AdminDriverApplicationPolicy) => call<{success: boolean}>("saveAdminDriverApplicationPolicy", {policy}),
  getOrderDeliveryPolicy: () => call<{policy: AdminOrderDeliveryPolicy}>("getAdminOrderDeliveryPolicy"),
  saveOrderDeliveryPolicy: (policy: AdminOrderDeliveryPolicy) => call<{success: boolean}>("saveAdminOrderDeliveryPolicy", {policy}),
  getCustomers: (input?: {search?: string; status?: "all" | "active" | "suspended"}) => call<{
    customers: AdminCustomerListItem[];
    counts: {total: number; active: number; suspended: number};
    limited: boolean;
  }>("getAdminCustomers", input),
  getCustomer: (customerId: string) => call<AdminCustomerDetail>("getAdminCustomer", {customerId}),
  setCustomerSuspension: (customerId: string, isSuspended: boolean, reason?: string) => call<{success: boolean}>("setAdminCustomerSuspension", {customerId, isSuspended, ...(reason ? {reason} : {})}),
  getPlatformReport: (periodDays: 7 | 30 | 90 | number) => call<AdminPlatformReport>("getAdminPlatformReport", {periodDays}),
  backfillPlatformReports: () => call<{success: boolean; ordersScanned: number; customersScanned: number; limited: boolean}>("backfillAdminPlatformDailyReports"),
  reindexCatalogSearch: (afterStoreId?: string) => call<{
    success: boolean;
    storesProcessed: number;
    nextAfterStoreId: string | null;
  }>("reindexAdminCatalogSearch", afterStoreId ? {afterStoreId} : undefined),
  getAuditLogs: (search = "") => call<{logs: AdminAuditLog[]; limited: boolean}>("getAdminAuditLogs", {search}),
  getHomePromotions: () => call<{promotions: HomePromotion[]}>("getAdminHomePromotions"),
  saveHomePromotion: (id: string | null, promotion: Omit<HomePromotion, "id">) => call<{id: string}>("saveAdminHomePromotion", {id, promotion}),
  deleteHomePromotion: (id: string) => call<{success: boolean}>("deleteAdminHomePromotion", {id}),
  getRefundClaims: (status = "pending_review") => call<{
    claims: AdminRefundClaimListItem[];
    counts: {pending_review: number; approved: number; rejected: number};
    limited: boolean;
  }>("getAdminRefundClaims", {status}),
  getRefundClaim: (claimId: string) =>
    call<AdminRefundClaimDetail>("getAdminRefundClaim", {claimId}),
  decideRefundClaim: (input: {
    claimId: string;
    decision: "approved" | "rejected";
    scope: "full" | "partial";
    amounts?: {
      merchandiseAmount?: number;
      taxAmount?: number;
      deliveryFeeAmount?: number;
      serviceFeeAmount?: number;
      driverTipAmount?: number;
    };
    note?: string;
  }) => call<{success: boolean; refundId: string | null}>(
    "decideAdminRefundClaim",
    input,
  ),
};

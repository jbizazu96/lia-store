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
import {ref, uploadBytesResumable} from "firebase/storage";
import {
  functions, storage,
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
  AdminOperationsOverview,
  AdminSearchResult,
  AdminOperationalControls,
  AdminDailyFinanceReport,
} from "@/types/adminWorkspace";
import type {HomePromotion} from "@/types/homePromotion";
import type {StoreContractWorkspace} from "@/types/storeContract";
import type {
  DeliveryZone,
  DeliveryZoneDraft,
} from "@/types/deliveryZone";
import type {
  ProductTaxClassification,
  ProductTaxClassificationDraft,
} from "@/types/productTaxClassification";

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

  getStoreApplications: (status: AdminApplicationStatus = "pending_review", cursor?: string) =>
    call<{applications: AdminApplicationListItem[]; counts: AdminApplicationCounts; nextCursor: string | null}>(
      "getAdminStoreApplications",
      {status, ...(cursor ? {cursor} : {})}
    ),

  getDriverApplications: (status: AdminApplicationStatus = "pending_review", cursor?: string) =>
    call<{applications: AdminApplicationListItem[]; counts: AdminApplicationCounts; nextCursor: string | null}>(
      "getAdminDriverApplications",
      {status, ...(cursor ? {cursor} : {})}
    ),

  getStoreApplication: (storeId: string) =>
    call<AdminStoreApplicationDetail>(
      "getAdminStoreApplication",
      {storeId}
    ),

  getStoreContracts: (storeId: string) =>
    call<StoreContractWorkspace>("getAdminStoreContracts", {storeId}),

  uploadStoreContract: async (
    storeId: string,
    file: File,
    onProgress?: (percentage: number) => void,
  ) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      throw new Error("Choose a PDF contract.");
    }
    if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
      throw new Error("Each PDF must be 10 MB or smaller.");
    }
    const upload = await call<{contractId: string; storagePath: string}>(
      "prepareAdminStoreContractUpload",
      {storeId, fileName: file.name, sizeBytes: file.size},
    );
    await new Promise<void>((resolve, reject) => {
      const task = uploadBytesResumable(ref(storage, upload.storagePath), file, {
        contentType: "application/pdf",
        cacheControl: "private,no-store,max-age=0",
        customMetadata: {
          storeId,
          contractId: upload.contractId,
          processingType: "store-contract-original",
        },
      });
      task.on("state_changed", (snapshot) => {
        onProgress?.(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
      }, reject, () => resolve());
    });
    await call<{success: boolean}>("finalizeAdminStoreContractUpload", {storeId, contractId: upload.contractId});
  },

  getStoreContractPreview: (storeId: string, contractId: string) =>
    call<{url: string; expiresAt: string}>("getAdminStoreContractPreview", {storeId, contractId}),

  deleteStoreContract: (storeId: string, contractId: string) =>
    call<{success: boolean}>("deleteAdminStoreContract", {storeId, contractId}),

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

  getOrders: (input?: {status?: string; exception?: string; cursor?: string}) =>
    call<{orders: AdminOrderListItem[]; nextCursor: string | null}>("getAdminOrders", input),

  getOrder: (orderId: string) =>
    call<AdminOrderDetail>("getAdminOrder", {orderId}),

  getFinanceOverview: () =>
    call<AdminFinanceOverview>("getAdminFinanceOverview"),

  getLiaFinanceReport: () =>
    call<AdminLiaFinanceReport>("getAdminLiaFinanceReport"),
  getOperationsOverview: () => call<AdminOperationsOverview>("getAdminOperationsOverview"),
  searchWorkspace: (query: string) => call<{results: AdminSearchResult[]}>("searchAdminWorkspace", {query}),
  retryFailedJob: (type: string, id: string, reason: string) => call<{success: boolean}>("retryAdminFailedJob", {type, id, reason}),
  getDailyFinanceReports: () => call<{reports: AdminDailyFinanceReport[]}>("getAdminDailyFinanceReports"),
  runDailyFinancialReconciliation: (date: string) => call<{report: AdminDailyFinanceReport}>("runAdminDailyFinancialReconciliation", {date}),
  getOperationalControls: () => call<{controls: AdminOperationalControls}>("getAdminOperationalControls"),
  saveOperationalControls: (controls: AdminOperationalControls) => call<{success: boolean; controls: AdminOperationalControls}>("saveAdminOperationalControls", {controls}),
  getCommissionSettings: (cursor?: string) => call<AdminCommissionSettings>("getAdminCommissionSettings", cursor ? {cursor} : undefined),
  getMarketplacePricingPolicy: () => call<{policy: Record<string, number | boolean> | null}>("getAdminMarketplacePricingPolicy"),
  saveDefaultStoreCommission: (basisPoints: number) => call<{success: boolean}>("saveAdminDefaultStoreCommission", {basisPoints}),
  saveDefaultDriverCommission: (basisPoints: number) => call<{success: boolean}>("saveAdminDefaultDriverCommission", {basisPoints}),
  saveMarketplacePricingPolicy: (policy: Record<string, number | boolean>) => call<{success: boolean}>("saveAdminMarketplacePricingPolicy", {policy}),
  saveStoreCommissionOverride: (storeId: string, basisPoints: number | null) => call<{success: boolean}>("saveAdminStoreCommissionOverride", {storeId, basisPoints}),
  getStoreApplicationPolicy: () => call<{policy: AdminStoreApplicationPolicy}>("getAdminStoreApplicationPolicy"),
  saveStoreApplicationPolicy: (policy: AdminStoreApplicationPolicy) => call<{success: boolean}>("saveAdminStoreApplicationPolicy", {policy}),
  getDriverApplicationPolicy: () => call<{policy: AdminDriverApplicationPolicy}>("getAdminDriverApplicationPolicy"),
  saveDriverApplicationPolicy: (policy: AdminDriverApplicationPolicy) => call<{success: boolean}>("saveAdminDriverApplicationPolicy", {policy}),
  getOrderDeliveryPolicy: () => call<{policy: AdminOrderDeliveryPolicy}>("getAdminOrderDeliveryPolicy"),
  saveOrderDeliveryPolicy: (policy: AdminOrderDeliveryPolicy) => call<{success: boolean}>("saveAdminOrderDeliveryPolicy", {policy}),
  getCustomers: (input?: {search?: string; status?: "all" | "active" | "suspended"; cursor?: string}) => call<{
    customers: AdminCustomerListItem[];
    counts: {total: number; active: number; suspended: number};
    limited: boolean;
    nextCursor: string | null;
  }>("getAdminCustomers", input),
  getCustomer: (customerId: string) => call<AdminCustomerDetail>("getAdminCustomer", {customerId}),
  setCustomerSuspension: (customerId: string, isSuspended: boolean, reason?: string) => call<{success: boolean}>("setAdminCustomerSuspension", {customerId, isSuspended, ...(reason ? {reason} : {})}),
  decideOrderZoneRequest: (input: {requestId: string; decision: "approved" | "rejected"; message: string; zoneId?: string}) => call<{success: boolean}>("decideAdminOrderZoneRequest", input),
  getPlatformReport: (periodDays: 7 | 30 | 90 | number) => call<AdminPlatformReport>("getAdminPlatformReport", {periodDays}),
  backfillPlatformReports: (input?: {orderCursor?: string; customerCursor?: string; ordersDone?: boolean; customersDone?: boolean}) => call<{success: boolean; ordersScanned: number; customersScanned: number; limited: boolean; nextOrderCursor: string | null; nextCustomerCursor: string | null}>("backfillAdminPlatformDailyReports", input),
  reindexCatalogSearch: (afterStoreId?: string) => call<{
    success: boolean;
    storesProcessed: number;
    nextAfterStoreId: string | null;
  }>("reindexAdminCatalogSearch", afterStoreId ? {afterStoreId} : undefined),
  getAuditLogs: (search = "", cursor?: string) => call<{logs: AdminAuditLog[]; limited: boolean; nextCursor: string | null}>("getAdminAuditLogs", {search, ...(cursor ? {cursor} : {})}),
  getHomePromotions: () => call<{promotions: HomePromotion[]}>("getAdminHomePromotions"),
  getProductCategories: () => call<{categories: Array<{id: string; name: string; iconUrl: string; freshnessEligible: boolean; defaultTaxCategoryId: string | null; allowedTaxCategoryIds: string[]}>}>("getAdminProductCategories"),
  getProductCatalogPolicy: () => call<{lowStockThreshold: number; inventoryEmailsPerDay: number}>("getAdminProductCatalogPolicy"),
  saveProductCatalogPolicy: (policy: {lowStockThreshold: number; inventoryEmailsPerDay: number}) => call<{success: boolean; productsUpdated: number}>("saveAdminProductCatalogPolicy", policy),
  createProductCategory: (category: {name: string; freshnessEligible: boolean; defaultTaxCategoryId: string | null; allowedTaxCategoryIds: string[]}) => call<{id: string}>("createAdminProductCategory", category),
  updateProductCategory: (id: string, category: {name: string; freshnessEligible: boolean; defaultTaxCategoryId: string | null; allowedTaxCategoryIds: string[]}) => call<{success: boolean}>("updateAdminProductCategory", {id, ...category}),
  uploadProductCategoryIcon: async (id: string, file: File) => {
    if (!file.type.match(/^image\/(jpeg|png|webp|avif)$/)) {
      throw new Error("Choose a JPG, PNG, WebP, or AVIF image.");
    }
    if (file.size <= 0 || file.size > 3 * 1024 * 1024) {
      throw new Error("Category images must be no larger than 3 MB.");
    }
    return call<{success: boolean; iconUrl: string}>("uploadAdminProductCategoryIcon", {
      id,
      contentType: file.type,
      base64: await imageBase64(file),
    });
  },
  importProductCategories: () => call<{success: boolean; created: number; productsScanned: number}>("importAdminProductCategories"),
  getProductSizeUnits: () => call<{units: Array<{id: string; label: string}>}>("getAdminProductSizeUnits"),
  createProductSizeUnit: (unit: {id: string; label: string}) => call<{id: string}>("createAdminProductSizeUnit", unit),
  updateProductSizeUnit: (id: string, nextId: string, label: string) => call<{success: boolean}>("updateAdminProductSizeUnit", {id, nextId, label}),
  deleteProductSizeUnit: (id: string) => call<{success: boolean}>("deleteAdminProductSizeUnit", {id}),
  importProductSizeUnits: () => call<{success: boolean; created: number; productsScanned: number}>("importAdminProductSizeUnits"),
  getProductTaxClassifications: () => call<{
    classifications: ProductTaxClassification[];
  }>("getAdminProductTaxClassifications"),
  createProductTaxClassification: (classification: ProductTaxClassificationDraft) =>
    call<{id: string}>("createAdminProductTaxClassification", classification),
  updateProductTaxClassification: (
    id: string,
    classification: Omit<ProductTaxClassificationDraft, "id">,
  ) => call<{success: boolean}>(
    "updateAdminProductTaxClassification",
    {id, ...classification},
  ),
  deleteProductTaxClassification: (id: string) =>
    call<{success: boolean}>("deleteAdminProductTaxClassification", {id}),
  backfillProductTaxClassifications: (cursor?: string) => call<{
    success: boolean;
    scanned: number;
    classified: number;
    deactivated: number;
    reactivated: number;
    unchanged: number;
    nextCursor: string | null;
  }>("backfillAdminProductTaxClassifications", cursor ? {cursor} : undefined),
  saveHomePromotion: (id: string | null, promotion: Omit<HomePromotion, "id">) => call<{id: string}>("saveAdminHomePromotion", {id, promotion}),
  deleteHomePromotion: (id: string) => call<{success: boolean}>("deleteAdminHomePromotion", {id}),
  getDeliveryZones: () => call<{zones: DeliveryZone[]}>("getAdminDeliveryZones"),
  createDeliveryZone: (zone: DeliveryZoneDraft) =>
    call<{id: string}>("createAdminDeliveryZone", {zone}),
  updateDeliveryZone: (id: string, zone: DeliveryZoneDraft) =>
    call<{success: boolean}>("updateAdminDeliveryZone", {id, zone}),
  addDeliveryZoneCity: (zoneId: string, cityName: string, stateCode: string) =>
    call<{success: boolean}>("addAdminDeliveryZoneCity", {zoneId, cityName, stateCode}),
  removeDeliveryZoneCity: (zoneId: string, cityKey: string) =>
    call<{success: boolean}>("removeAdminDeliveryZoneCity", {zoneId, cityKey}),
  deleteDeliveryZone: (id: string) =>
    call<{success: boolean}>("deleteAdminDeliveryZone", {id}),
  backfillDeliveryZoneAssignments: () => call<{
    success: boolean;
    customers: {scanned: number; matched: number; defaultPricing: number; skippedAdmin: number; missingAddress: number};
    stores: {scanned: number; matched: number; defaultPricing: number; skippedAdmin: number; missingAddress: number};
    drivers: {scanned: number; matched: number; defaultPricing: number; skippedAdmin: number; missingAddress: number};
  }>("backfillAdminDeliveryZoneAssignments"),
  getDeliveryZonePricing: (zoneId: string) => call<{
    zone: {id: string; name: string; primaryStateCode: string; maximumRouteMiles: number};
    policy: Record<string, number>;
    inherited: boolean;
  }>("getAdminDeliveryZonePricing", {zoneId}),
  saveDeliveryZonePricing: (zoneId: string, policy: Record<string, number | boolean>) =>
    call<{success: boolean}>("saveAdminDeliveryZonePricing", {zoneId, policy}),
  resetDeliveryZonePricing: (zoneId: string) =>
    call<{success: boolean}>("resetAdminDeliveryZonePricing", {zoneId}),
  setAccountZoneAssignment: (input: {
    accountType: "customer" | "store" | "driver";
    accountId: string;
    homeZoneId: string | null;
    serviceZoneIds?: string[];
    orderZoneIds?: string[];
  }) => call<{success: boolean}>("setAdminAccountZoneAssignment", input),
  getRefundClaims: (status = "pending_review", cursor?: string) => call<{
    claims: AdminRefundClaimListItem[];
    counts: {pending_review: number; approved: number; rejected: number};
    limited: boolean;
    nextCursor: string | null;
  }>("getAdminRefundClaims", {status, ...(cursor ? {cursor} : {})}),
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

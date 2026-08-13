/*
|--------------------------------------------------------------------------
| Store Workspace Client Service
|--------------------------------------------------------------------------
|
| Store pages use callable Functions for private workspace data. This keeps
| Admin SDK access out of Vercel and prevents UI code from writing Firestore
| store documents directly.
|
*/

import {
  httpsCallable,
} from "firebase/functions";

import {
  functions,
} from "@/lib/firebase";
import {
  invalidateCached,
  loadCached,
  writeCached,
} from "@/services/cache/clientDataCache";

export interface StoreWorkspaceStore {
  id: string;
  name: string;
  email: string;
  phone: string;
  description: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  placeId: string;
  logoUrl: string;
  bannerUrl: string;
  logoImageStatus: "" | "processing" | "ready" | "failed";
  bannerImageStatus: "" | "processing" | "ready" | "failed";
  logoImageId: string;
  bannerImageId: string;
  category: string;
  rating: number;
  isOpen: boolean;
  schedule: Array<{
    day: string;
    open: string;
    close: string;
    isClosed: boolean;
  }>;
  isApproved: boolean;
  isActive: boolean;
  businessType: string;
  registeredName: string;
  ein: string;
  businessStructure: string;
  storeFrontUrl: string;
  storeInsideUrl: string;
  orderNotifications: boolean;
  paymentNotifications: boolean;
  productStockNotifications: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  stripeAccountId?: string;
  stripeAccountStatus?: import("@/types/stripeConnect").StripeOnboardingStatus;
  stripeChargesEnabled?: boolean;
  stripeTransfersEnabled?: boolean;
  stripePayoutsEnabled?: boolean;
  stripeDetailsSubmitted?: boolean;
  stripeRequiresAction?: boolean;
  stripeIsReady?: boolean;
}

export interface StoreWorkspaceUser {
  displayName: string;
  email: string;
  phone: string;
  language: string;
}

export interface StoreSettingsAuditEntry {
  id: string;
  action: string;
  changedFields: string[];
  createdAt: string | null;
}

export interface StoreWorkspacePayout {
  id: string;
  orderId: string;
  orderNumber: string | null;
  amount: number;
  originalTransferAmount: number;
  refundedAmount: number;
  netAmount: number;
  merchandiseSubtotal: number;
  salesTax: number;
  grossStoreOrderAmount: number;
  liaCommission: number;
  status: "pending" | "completed" | "failed";
  date: string;
  createdAt: string;
  completedAt: string;
  method: string;
}

interface SettingsResponse {
  store: StoreWorkspaceStore;
  user: StoreWorkspaceUser;
}

export interface StoreWorkspaceEntry {
  hasStore: boolean;
  store: (Pick<StoreWorkspaceStore, "id" | "name" | "logoUrl" | "isApproved" | "isActive"> & {
    onboardingCompleted: boolean;
    onboardingStep: string;
  }) | null;
  pendingOrderCount: number;
}

async function call<T>(
  name: string,
  data?: unknown
): Promise<T> {
  const callable = httpsCallable<unknown, T>(
    functions,
    name
  );
  const result = await callable(data);
  return result.data;
}

export const storeWorkspaceClientService = {
  getEntry: async (forceRefresh = false) => {
    if (forceRefresh) {
      return writeCached(
        "store-workspace-entry",
        await call<StoreWorkspaceEntry>("getStoreWorkspaceEntry"),
        {ttlMs: 15_000},
      );
    }
    return loadCached(
      "store-workspace-entry",
      () => call<StoreWorkspaceEntry>("getStoreWorkspaceEntry"),
      {ttlMs: 15_000},
    );
  },

  getFinancials: () => call<{
    earnings: {
      totalEarnings: number;
      grossStoreEarnings: number;
      storeCommission: number;
      refundDeductions: number;
      grossMerchandiseSales: number;
      salesTax: number;
      availableBalance: number | null;
      stripePendingBalance: number | null;
      pendingBalance: number;
      weeklyEarnings: number; monthlyEarnings: number;
      timeZone: string;
      stripe: {
        accountId: string | null;
        status: string;
        isReady: boolean;
        payoutsEnabled: boolean;
        requiresAction: boolean;
      };
      stripeProcessingFeesPaidBy: "lia_platform";
      payouts: StoreWorkspacePayout[];
    };
    }>("getStoreWorkspaceFinancials"),

  getAnalytics: (period: "week" | "month" | "year") => call<{
    period: "week" | "month" | "year";
    timeZone: string;
    periodStart: string;
    periodEnd: string;
    totalOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    openOrders: number;
    grossMerchandiseSales: number;
    refundedMerchandise: number;
    netMerchandiseSales: number;
    salesTax: number;
    refundedSalesTax: number;
    netSalesTax: number;
    storeCommission: number;
    grossStoreEarnings: number;
    storeRefundImpact: number;
    netStoreEarnings: number;
    completedPayouts: number;
    customerRefundTotal: number;
    refundCount: number;
    averageOrderValue: number;
    totalCustomers: number;
    averageRating: number;
    peakHours: number[];
    orderSeries: Array<{label: string; value: number}>;
    orderGrowth: number;
    revenueGrowth: number;
    topProducts: Array<{name: string; sales: number}>;
  }>("getStoreWorkspaceAnalytics", {period}),

  getPayouts: (
    pageSize = 25,
    cursor?: string,
  ) => call<{
    payouts: StoreWorkspacePayout[];
    nextCursor: string | null;
  }>("getStoreWorkspacePayouts", {
    pageSize,
    ...(cursor ? { cursor } : {}),
  }),

  getOrders: (options: {
    pageSize?: number;
    cursor?: string;
    status?: string;
    search?: string;
    from?: string;
    to?: string;
  } = {}) => call<{
    orders: Array<Record<string, unknown> & { id: string }>;
    stats: {
      total: number;
      pending: number;
      accepted: number;
      preparing: number;
      readyForPickup: number;
      outForDelivery: number;
      completed: number;
      cancelled: number;
    };
    nextCursor: string | null;
  }>("getStoreWorkspaceOrders", options),

  getOrder: (
    orderId: string
  ) => call<{
    order: Record<string, unknown> & { id: string };
  }>("getStoreWorkspaceOrder", { orderId }),

  getDashboard: () => call<{
    storeName: string;
    timeZone: string;
    stats: {
      totalOrders: number;
      netStoreEarnings: number;
      currentWeekNetEarnings: number;
      refundDeductions: number;
      totalCustomers: number;
      averageRating: number;
      pendingOrders: number;
      activeOrders: number;
      todayOrders: number;
      weeklyGrowth: number;
      earningsGrowth: number;
    };
    recentOrders: Array<{
      id: string;
      customerName: string;
      grossStoreOrderAmount: number;
      displayStoreAmount: number;
      amountType: "gross" | "net";
      status: string;
      paidAt: string;
      itemCount: number;
    }>;
    }>("getStoreWorkspaceDashboard"),

  getSettings: async (forceRefresh = false) => {
    if (forceRefresh) {
      return writeCached(
        "store-workspace-settings",
        await call<SettingsResponse>(
          "getStoreWorkspaceSettings"
        ),
        { ttlMs: 30_000 },
      );
    }

    return loadCached(
    "store-workspace-settings",
    () => call<SettingsResponse>(
      "getStoreWorkspaceSettings"
    ),
    { ttlMs: 30_000 },
    );
  },

  saveSettings: (
    store: Partial<StoreWorkspaceStore>,
    user: Partial<StoreWorkspaceUser>,
    section: "profile" | "business" | "notifications",
  ) => call<SettingsResponse>(
    "saveStoreWorkspaceSettings",
    {store, user, section}
  ).then((workspace) => {
    invalidateCached("store-workspace-entry");
    invalidateCached("store-workspace-dashboard");
    return writeCached("store-workspace-settings", workspace, { ttlMs: 30_000 });
  }),

  saveSchedule: (
    schedule: StoreWorkspaceStore["schedule"]
  ) => call<{
    schedule: StoreWorkspaceStore["schedule"];
  }>(
    "saveStoreWorkspaceSchedule",
    { schedule }
  ).then((response) => {
    invalidateCached("store-workspace-settings");
    return response;
  }),

  getSettingsAudit: () => call<{entries: StoreSettingsAuditEntry[]}>("getStoreSettingsAudit"),
};

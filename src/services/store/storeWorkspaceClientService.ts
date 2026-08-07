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
}

export interface StoreWorkspaceUser {
  displayName: string;
  email: string;
  phone: string;
  language: string;
}

export interface StoreWorkspacePayout {
  id: string;
  orderId: string;
  orderNumber: string | null;
  amount: number;
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
  getEntry: () => loadCached(
    "store-workspace-entry",
    () => call<{
      hasStore: boolean;
      store: (Pick<StoreWorkspaceStore, "id" | "name" | "logoUrl" | "isApproved" | "isActive"> & {
        onboardingCompleted: boolean;
        onboardingStep: string;
      }) | null;
      pendingOrderCount: number;
    }>("getStoreWorkspaceEntry"),
    { ttlMs: 15_000 },
  ),

  getFinancials: () => loadCached(
    "store-workspace-financials",
    () => call<{
    analytics: {
      totalOrders: number; totalRevenue: number; averageOrderValue: number;
      totalCustomers: number; averageRating: number; peakHours: number[];
      dailyOrders: number[]; weeklyGrowth: number; revenueGrowth: number;
      topProducts: Array<{name: string; sales: number}>;
    };
    earnings: {
      totalEarnings: number; availableBalance: number; pendingBalance: number;
      weeklyEarnings: number; monthlyEarnings: number;
      payouts: StoreWorkspacePayout[];
    };
    }>("getStoreWorkspaceFinancials"),
    { ttlMs: 30_000 },
  ),

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

  getOrders: () => call<{
    orders: Array<Record<string, unknown> & { id: string }>;
  }>("getStoreWorkspaceOrders"),

  getOrder: (
    orderId: string
  ) => call<{
    order: Record<string, unknown> & { id: string };
  }>("getStoreWorkspaceOrder", { orderId }),

  getDashboard: () => loadCached(
    "store-workspace-dashboard",
    () => call<{
    storeName: string;
    stats: {
      totalOrders: number;
      totalRevenue: number;
      totalCustomers: number;
      averageRating: number;
      pendingOrders: number;
      todayOrders: number;
      weeklyGrowth: number;
      revenueGrowth: number;
    };
    recentOrders: Array<{
      id: string;
      customerName: string;
      storeTotal: number;
      status: string;
      createdAt: string;
      itemCount: number;
    }>;
    }>("getStoreWorkspaceDashboard"),
    { ttlMs: 15_000 },
  ),

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
    user: Partial<StoreWorkspaceUser>
  ) => call<SettingsResponse>(
    "saveStoreWorkspaceSettings",
    { store, user }
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
};

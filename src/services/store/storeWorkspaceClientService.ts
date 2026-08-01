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
  getEntry: () => call<{
    hasStore: boolean;
    store: (Pick<StoreWorkspaceStore, "id" | "name" | "logoUrl" | "isApproved" | "isActive"> & {
      onboardingCompleted: boolean;
      onboardingStep: string;
    }) | null;
    pendingOrderCount: number;
  }>("getStoreWorkspaceEntry"),

  getFinancials: () => call<{
    analytics: {
      totalOrders: number; totalRevenue: number; averageOrderValue: number;
      totalCustomers: number; averageRating: number; peakHours: number[];
      dailyOrders: number[]; weeklyGrowth: number; revenueGrowth: number;
      topProducts: Array<{name: string; sales: number}>;
    };
    earnings: {
      totalEarnings: number; availableBalance: number; pendingBalance: number;
      weeklyEarnings: number; monthlyEarnings: number;
      payouts: Array<{id: string; amount: number; status: "pending" | "completed" | "failed"; date: string; method: string}>;
    };
  }>("getStoreWorkspaceFinancials"),

  getOrders: () => call<{
    orders: Array<Record<string, unknown> & { id: string }>;
  }>("getStoreWorkspaceOrders"),

  getOrder: (
    orderId: string
  ) => call<{
    order: Record<string, unknown> & { id: string };
  }>("getStoreWorkspaceOrder", { orderId }),

  getDashboard: () => call<{
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

  getSettings: () =>
    call<SettingsResponse>(
      "getStoreWorkspaceSettings"
    ),

  saveSettings: (
    store: Partial<StoreWorkspaceStore>,
    user: Partial<StoreWorkspaceUser>
  ) => call<SettingsResponse>(
    "saveStoreWorkspaceSettings",
    { store, user }
  ),

  saveSchedule: (
    schedule: StoreWorkspaceStore["schedule"]
  ) => call<{
    schedule: StoreWorkspaceStore["schedule"];
  }>(
    "saveStoreWorkspaceSchedule",
    { schedule }
  ),
};

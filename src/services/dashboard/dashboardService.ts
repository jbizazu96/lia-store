/*
|--------------------------------------------------------------------------
| Dashboard Service
|--------------------------------------------------------------------------
|
| Kept as a small compatibility service for existing imports. The dashboard
| itself is a callable aggregate; it must not read a private store document
| or compute store earnings from checkout totals in the browser.
|
*/

import {
  storeWorkspaceClientService,
} from "@/services/store/storeWorkspaceClientService";
import type {
  DashboardData,
} from "@/types/dashboard";

export const dashboardService = {
  async getStoreDashboard(
    storeId: string,
  ): Promise<DashboardData | null> {
    if (!storeId.trim()) {
      return null;
    }

    return storeWorkspaceClientService
      .getDashboard();
  },
};
